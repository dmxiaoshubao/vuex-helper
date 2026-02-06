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

export default new Vuex.Store({
  state,
  mutations,
});
