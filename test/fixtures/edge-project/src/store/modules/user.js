const SET_NAME = 'SET_NAME';

const userModule = {
  namespaced: true,
  state: {
    profile: {
      name: 'guest',
    },
  },
  getters: {
    'displayName': (state) => state.profile.name,
  },
  mutations: {
    [SET_NAME](state, name) {
      state.profile.name = name;
    },
    'RESET_PROFILE'(state) {
      state.profile = { name: 'guest' };
    },
  },
  actions: {
    ['fetchProfile']({ commit }, name) {
      commit(SET_NAME, name);
    },
  },
};

export default userModule;
