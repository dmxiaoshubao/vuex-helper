const state = {
  /** 你好呀 */
  name: "John Doe",
  // User age
  age: 25,
  /**
   * User roles
   * @type {string[]}
   */
  roles: ["user"],
  isActive: true, // Activity status
};

const mutations = {
  /**
   * @description 设置名称
   * @param {string} name 看看这是啥？
   * 你好
   */
  SET_NAME(state, name) {
    state.name = name;
  },
  testName(state, name) {
    state.name = name;
  },
  // Set age
  SET_AGE(state, age) {
    state.age = age;
  },
  /**
   * Add role
   * @param {string} role
   */
  ADD_ROLE(state, role) {
    state.roles.push(role);
  },
  toggleActive(state) {
    state.isActive = !state.isActive;
  },
  /**
   * Set user profile
   */
  SET_PROFILE(state, profile) {
    state.name = profile.name;
    state.age = profile.age;
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
  /**
   * Fetch user profile
   * @param {object} context
   */
  async fetchProfile({ commit }) {
    // mock api
    const profile = { name: "Jane Doe", age: 30 };
    commit("SET_PROFILE", profile);
  },
  // Logout user
  logout({ commit }) {
    commit("SET_NAME", "");
    commit("SET_AGE", 0);
  },
  /**
   * Example of accessing root state and getters
   * @param {object} context
   */
  accessRootState({ commit, rootState, rootGetters }) {
    console.log("Root Count:", rootState.count);
    console.log("Root IsLoggedIn:", rootGetters.isLoggedIn);

    // Commit root mutation
    commit("increment", null, { root: true });
  },
  /**
   * Example of dispatching root action
   */
  async callRootAction({ dispatch }) {
    dispatch("");
  },
};

const getters = {
  /** 获取大写名称 */
  upperName: (state) => state.name.toUpperCase(),
  // Get user age
  userAge: (state) => state.age,
  /**
   * Check if user has role
   * @param {object} state
   * @returns {function}
   */
  hasRole: (state) => (role) => {
    return state.roles.includes(role);
  },
  isAdmin: (state) => state.roles.includes("admin"),
};

export default {
  namespaced: true,
  state,
  getters,
  mutations,
  actions,
};
