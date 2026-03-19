import Vue from 'vue';
import Vuex from 'vuex';
import legacy from './modules/legacy';
import safeModule from './modules/safe';

Vue.use(Vuex);

export default new Vuex.Store({
  state: {
    count: 1,
  },
  getters: {
    sharedTotal: (state) => state.count,
  },
  modules: {
    legacy,
    safeModule,
  },
});
