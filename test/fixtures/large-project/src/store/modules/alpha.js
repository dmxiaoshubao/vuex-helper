export default {
  namespaced: true,
  state: {
    profile: {
      id: 1,
      name: 'alpha',
      settings: {
        enabled: true,
        mode: 'safe',
      },
    },
    metrics: {
      load: 0,
      latency: 0,
    },
  },
  getters: {
    isEnabled: (state) => state.profile.settings.enabled,
  },
  mutations: {
    SET_MODE(state, mode) {
      state.profile.settings.mode = mode;
    },
  },
  actions: {
    setMode({ commit }, mode) {
      commit('SET_MODE', mode);
    },
  },
};
