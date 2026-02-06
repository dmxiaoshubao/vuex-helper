import Vue from "vue";
import Vuex from "vuex";
import user from "./modules/user";

Vue.use(Vuex);

export default new Vuex.Store({
  state: {
    /** count */
    count: 0,
  },
  mutations: {
    /** 增加 */
    increment(state) {
      state.count++;
    },
  },
  actions: {
    incrementAsync({ commit }) {
      setTimeout(() => {
        commit("increment");
      }, 1000);
    },
  },
  modules: {
    user,
  },
});
