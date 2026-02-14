import Vue from 'vue';
import Vuex from 'vuex';
import user from './modules/user';
import publicModule from './modules/public';

Vue.use(Vuex);

const SET_ROOT = 'SET_ROOT';

const options = {
  state: {
    rootCount: 0,
  },
  getters: {
    'rootDouble': (state) => state.rootCount * 2,
  },
  mutations: {
    [SET_ROOT](state) {
      state.rootCount += 1;
    },
    'SET_FLAG'(state, value) {
      state.flag = value;
    },
  },
  actions: {
    ['loadRoot']({ commit }) {
      commit(SET_ROOT);
    },
  },
  modules: {
    userModule: user,
    publicModule,
  },
};

const store = new Vuex.Store(options);

export default store;
