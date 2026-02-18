import Vue from 'vue';
import Vuex from 'vuex';
import alpha from './modules/alpha';
import beta from './modules/beta';
import gamma from './modules/gamma';
import delta from './modules/delta';
import epsilon from './modules/epsilon';

Vue.use(Vuex);

export default new Vuex.Store({
  state: {
    app: {
      build: {
        number: 1024,
        branch: 'main',
      },
      features: {
        search: true,
        telemetry: false,
      },
    },
    counters: {
      views: 0,
      clicks: 0,
    },
  },
  getters: {
    buildNumber: (state) => state.app.build.number,
  },
  mutations: {
    INCREMENT_VIEWS(state) {
      state.counters.views += 1;
    },
  },
  actions: {
    incrementViews({ commit }) {
      commit('INCREMENT_VIEWS');
    },
  },
  modules: {
    alpha,
    beta,
    gamma,
    delta,
    epsilon,
  },
});
