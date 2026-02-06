import Vue from "vue";
import Vuex from "vuex";

Vue.use(Vuex);

const state = {
  /** 哈哈哈 */
  appName: "Custom Entry App",
};

const mutations = {
  /** 设置应用名称 */
  SET_APP_NAME(state, name) {
    state.appName = name;
  },
};

const actions = {
  /** 设置应用名称 */
  setAppNameAsync({ commit }, name) {
    setTimeout(() => {
      commit("SET_APP_NAME", name);
    }, 1000);
  },
};

export default new Vuex.Store({
  state,
  mutations,
  actions,
});
