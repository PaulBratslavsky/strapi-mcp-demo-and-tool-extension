import type { Core } from '@strapi/strapi';
import { z } from '@strapi/utils';

const ROLE_UID = 'plugin::api-permissions.role';
const PERMISSION_UID = 'plugin::api-permissions.permission';
const PUBLIC_READ_ACTIONS = ['find', 'findOne'] as const;

export default {
  async register({ strapi }: { strapi: Core.Strapi }) {
    if (!strapi.ai.mcp.isEnabled()) return;

    // App-level admin permission so the stats tool is grantable per token.
    // An app isn't a plugin, so it goes under section: 'settings'; the action
    // id comes out as api::stats-overview.read.
    await strapi.service('admin::permission').actionProvider.registerMany([
      {
        section: 'settings',
        category: 'MCP',
        displayName: 'Read content stats overview',
        uid: 'stats-overview.read',
      },
    ]);

    strapi.ai.mcp.registerTool({
      name: 'get_stats_overview',
      title: 'Get content stats overview',
      description: 'Return aggregate counts of published articles, authors, and categories.',
      resolveOutputSchema: () =>
        z.object({
          articles: z.number().int().nonnegative(),
          authors: z.number().int().nonnegative(),
          categories: z.number().int().nonnegative(),
        }),
      auth: { policies: [{ action: 'api::stats-overview.read' }] },
      createHandler: (strapi) => async () => {
        const overview = await strapi.service('api::stats.stats').overview();
        return {
          content: [{ type: 'text', text: JSON.stringify(overview) }],
          structuredContent: overview,
        };
      },
    });
  },

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    if (!strapi.plugin('api-permissions')) return;
    if (!strapi.contentTypes['plugin::better-auth.user' as never]) {
      strapi.log.warn(
        '[bootstrap] better-auth content types not found — run `npx -y @better-auth/cli generate --config src/lib/auth.ts --yes` first.',
      );
      return;
    }

    const documents = strapi.documents as any;

    const publicRole = await documents(ROLE_UID).findFirst({
      filters: { type: 'public' },
    });

    if (!publicRole) {
      strapi.log.warn('[bootstrap] Public role not found — skipping permission seed.');
      return;
    }

    const apiContentTypeUids = Object.keys(strapi.contentTypes).filter((uid) =>
      uid.startsWith('api::'),
    );

    const existing: Array<{ action: string }> = await documents(PERMISSION_UID).findMany({
      filters: { role: { documentId: publicRole.documentId } },
      fields: ['action'],
    });
    const existingActions = new Set(existing.map((p) => p.action));

    for (const uid of apiContentTypeUids) {
      for (const action of PUBLIC_READ_ACTIONS) {
        const actionKey = `${uid}.${action}`;
        if (existingActions.has(actionKey)) continue;
        await documents(PERMISSION_UID).create({
          data: { action: actionKey, role: publicRole.id },
        });
      }
    }
  },
};
