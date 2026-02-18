export default {
  namespaced: true,
  state: {
    catalog: {
      items: [],
      filters: {
        category: 'all',
        tags: [],
      },
    },
  },
  getters: {
    hasFilters: (state) => state.catalog.filters.category !== 'all' || state.catalog.filters.tags.length > 0,
  },
  mutations: {
    SET_CATEGORY(state, category) {
      state.catalog.filters.category = category;
    },
  },
  actions: {
    setCategory({ commit }, category) {
      commit('SET_CATEGORY', category);
    },
  },
};
