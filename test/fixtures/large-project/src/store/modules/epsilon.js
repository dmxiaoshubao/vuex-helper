export default {
  namespaced: true,
  state: {
    flags: {
      experiments: {
        smartSearch: false,
        fastHover: true,
      },
      rollout: {
        percentage: 25,
      },
    },
  },
  getters: {
    smartSearchEnabled: (state) => state.flags.experiments.smartSearch,
  },
  mutations: {
    SET_SMART_SEARCH(state, value) {
      state.flags.experiments.smartSearch = value;
    },
  },
  actions: {
    setSmartSearch({ commit }, value) {
      commit('SET_SMART_SEARCH', value);
    },
  },
};
