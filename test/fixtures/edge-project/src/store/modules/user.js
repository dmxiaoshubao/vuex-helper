const SET_NAME2 = 'SET_NAME';

const userModule = {
  namespaced: true,
  state: {
    profile: {
    },
    profile2: {
      name: 'guest',
    },
  },
  getters: {
    'displayName': (state) => state.profile.name,
  },
  mutations: {
    [SET_NAME2](state, name) {
      state.profile.name = name;
    },
    'RESET_PROFILE'(state) {
      state.profile = { name: 'guest' };
    },
  },
  actions: {
    ['fetchProfile']({ commit }, name) {
      commit('RESET_PROFILE')
      commit(SET_NAME2, name);
    },
  },
};

export default userModule;
