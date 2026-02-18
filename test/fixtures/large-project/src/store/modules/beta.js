export default {
  namespaced: true,
  state: {
    users: {
      active: 12,
      archived: 3,
      limits: {
        max: 100,
        warning: 80,
      },
    },
  },
  getters: {
    isNearLimit: (state) => state.users.active >= state.users.limits.warning,
  },
  mutations: {
    SET_ACTIVE(state, value) {
      state.users.active = value;
    },
  },
  actions: {
    updateActive({ commit }, value) {
      commit('SET_ACTIVE', value);
    },
  },
};
