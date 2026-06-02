export default {
  async index(ctx) {
    ctx.body = await strapi
      .service('api::stats.stats').overview();
  },
};
