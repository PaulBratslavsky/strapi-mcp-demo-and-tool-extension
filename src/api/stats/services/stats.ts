export default {
  async overview() {
    const [articles, authors, categories] = await Promise.all([
      strapi.documents('api::article.article').count({ status: 'published' }),
      strapi.documents('api::author.author').count({}),
      strapi.documents('api::category.category').count({}),
    ]);
    return { articles, authors, categories };
  },
};
