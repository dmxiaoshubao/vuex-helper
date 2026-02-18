export default {
  namespaced: true,
  state: {
    network: {
      status: {
        online: true,
        retries: 0,
      },
      config: {
        timeout: 3000,
        endpoint: '/api',
      },
    },
  },
  getters: {
    isOnline: (state) => state.network.status.online,
  },
  mutations: {
    SET_ONLINE(state, value) {
      state.network.status.online = value;
    },
  },
  actions: {
    setOnline({ commit }, value) {
      commit('SET_ONLINE', value);
    },
  },
};
