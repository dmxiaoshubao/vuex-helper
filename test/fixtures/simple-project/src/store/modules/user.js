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
    // ========================================
    // rootState 自测用例
    // ========================================

    // [RS.1] rootState. 补全 — 应显示根 state 属性 (count, isLoggedIn, preferences, items) 和子模块名 (user, others)
    rootState.count; // <- 光标放点后

    // [RS.2] rootState.xxx 跳转/悬浮 — 点击 count 应跳转到根模块 index.js 的 count 定义
    rootState.count; // <- 光标放 count 上

    // [RS.3] rootState.others. 补全 — 应显示 others 模块的 state: productName, version, theme, language, notifications, lastUpdated
    rootState.others.productName; // <- 光标放最后一个点后

    // [RS.4] rootState.others.xxx 跳转/悬浮 — 点击 productName 应跳转到 others.js 的 productName 定义
    rootState.others.productName; // <- 光标放 productName 上

    // [RS.5] rootState.user. 补全 — 应显示 user 模块的 state: name, age, roles, isActive
    rootState.user.name; // <- 光标放最后一个点后

    // [RS.6] rootState 中间路径词跳转 — 点击 others 应跳转到 others 模块文件
    rootState.others.theme; // <- 光标放 others 上

    // [RS.7] rootState 中间路径词跳转 — 点击 user 应跳转到 user 模块文件
    rootState.user.age; // <- 光标放 user 上

    // ========================================
    // rootGetters 自测用例
    // ========================================

    // [RG.1] rootGetters. 补全 — 应显示所有 getter 的完整路径: isLoggedIn, getItemById, user/upperName, user/hasRole, others/isDarkMode 等
    rootGetters.isLoggedIn; // <- 光标放点后

    // [RG.2] rootGetters.xxx 跳转/悬浮 — 点击 isLoggedIn 应跳转到根模块 index.js 的 isLoggedIn getter 定义
    rootGetters.isLoggedIn; // <- 光标放 isLoggedIn 上

    // [RG.3] rootGetters['xxx'] 方括号补全 — 应显示所有 getter 的完整路径
    rootGetters['user/upperName']; // <- 光标放引号内

    // [RG.4] rootGetters['ns/xxx'] 跳转/悬浮 — 点击 upperName 应跳转到 user.js 的 upperName getter 定义
    rootGetters['user/upperName']; // <- 光标放 upperName 上

    // [RG.5] rootGetters['xxx'] 另一个命名空间 — others 模块的 getter
    rootGetters['others/isDarkMode']; // <- 光标放引号内

    // Commit root mutation
    commit("increment", null, { root: true });
    commit('toggleActive', null, { root: false })
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

  // ========================================
  // rootState / rootGetters 在 getter 中的自测用例
  // getter 的第 3 个参数是 rootState，第 4 个参数是 rootGetters
  // ========================================

  /**
   * [RG.getter.1] getter 中访问 rootState — 补全/跳转/悬浮
   */
  nameWithCount: (state, getters, rootState, rootGetters) => {
    // rootState. 补全 — 应显示根 state 属性和子模块名
    rootState.count; // <- 光标放点后

    // rootState.others. 补全 — 应显示 others 模块的 state
    rootState.others.productName; // <- 光标放最后一个点后

    // rootGetters. 补全 — 应显示所有 getter 的完整路径
    rootGetters.isLoggedIn; // <- 光标放点后

    // rootGetters['xxx'] 方括号补全
    rootGetters['others/isDarkMode']; // <- 光标放引号内

    return `${state.name} (${rootState.others.language})`;
  },
};

export default {
  namespaced: true,
  state,
  getters,
  mutations,
  actions,
};
