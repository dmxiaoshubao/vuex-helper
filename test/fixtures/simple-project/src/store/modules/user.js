const state = {
  /** 你好呀 */
  name: "John Doe",
};

const mutations = {
  /**
   * @description 设置名称
   * @param {string} name 看看这是啥？
   * 啊 sd 卡减肥哈就考试的回复
   * 水电费
   */
  SET_NAME(state, name) {
    state.name = name;
  },
  testName(state, name) {
    state.name = name;
  },
};

const actions = {
  // 嗯？
  // 更新名称
  updateName({ commit }, name) {
    commit("SET_NAME", name);
  },
  updateInfoAsync({ commit, dispatch }, name) {
    commit("SET_NAME", name);
    dispatch("updateName", name);
  },
};

const getters = {
  /** 获取大写名称 */
  upperName: (state) => state.name.toUpperCase(),
};

export default {
  namespaced: true,
  state,
  getters,
  mutations,
  actions,
};
