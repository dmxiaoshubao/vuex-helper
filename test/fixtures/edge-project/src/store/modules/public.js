const TOGGLE = 'TOGGLE';

export default {
  namespaced: false,
  state: {
    enabled: false,
  },
  mutations: {
    [TOGGLE](state) {
      state.enabled = !state.enabled;
    },
  },
  actions: {
    ['trigger']({ commit }) {
      commit(TOGGLE);
    },
  },
};
