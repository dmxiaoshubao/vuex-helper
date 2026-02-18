/**
 * Others Module - 产品与系统设置相关
 */
const state = {
  /** 产品名称 */
  productName: "MyApp",
  /** 产品版本 */
  version: "1.0.0",
  /**
   * 主题设置
   * @type {'light' | 'dark' | 'auto'}
   */
  theme: "light",
  /** 语言设置 */
  language: "zh-CN",
  /** 通知开关 */
  notifications: true,
  /** 最后更新时间 */
  lastUpdated: null,
};

const mutations = {
  /**
   * 设置产品名称
   * @param {string} name
   */
  SET_PRODUCT_NAME(state, name) {
    state.productName = name;
  },
  /**
   * 设置版本号
   * @param {string} version
   */
  SET_VERSION(state, version) {
    state.version = version;
    state.lastUpdated = new Date().toISOString();
  },
  /**
   * 切换主题
   */
  toggleTheme(state) {
    const themes = ["light", "dark", "auto"];
    const currentIndex = themes.indexOf(state.theme);
    state.theme = themes[(currentIndex + 1) % themes.length];
  },
  /**
   * 设置主题
   * @param {'light' | 'dark' | 'auto'} theme
   */
  SET_THEME(state, theme) {
    state.theme = theme;
  },
  /**
   * 设置语言
   * @param {string} language
   */
  SET_LANGUAGE(state, language) {
    state.language = language;
  },
  /**
   * 切换通知开关
   */
  toggleNotifications(state) {
    state.notifications = !state.notifications;
  },
  /**
   * 重置所有设置
   */
  RESET_SETTINGS(state) {
    state.theme = "light";
    state.language = "zh-CN";
    state.notifications = true;
  },
};

const actions = {
  /**
   * 更新产品名称
   * @param {string} name
   */
  updateProductName({ commit }, name) {
    commit("SET_PRODUCT_NAME", name);
  },
  /**
   * 更新版本号
   * @param {string} version
   */
  updateVersion({ commit }, version) {
    commit("SET_VERSION", version);
  },
  /**
   * 异步切换主题
   */
  async changeTheme({ commit }, theme) {
    // 模拟异步操作
    await new Promise((resolve) => setTimeout(resolve, 100));
    commit("SET_THEME", theme);
  },
  /**
   * 更新语言设置
   * @param {string} language
   */
  updateLanguage({ commit }, language) {
    commit("SET_LANGUAGE", language);
  },
  /**
   * 恢复出厂设置
   */
  async factoryReset({ commit, dispatch }) {
    commit("RESET_SETTINGS");
    await dispatch("updateVersion", "1.0.0");
  },
  /**
   * 示例：访问根状态
   */
  accessRootState({ rootState }) {
    // [RS.others.1] rootState. 补全 — 应显示根 state 和子模块名
    rootState.count; // <- 光标放点后

    // [RS.others.2] rootState.user. 补全 — 应显示 user 模块 state
    rootState.user.name; // <- 光标放最后一个点后

    // [RS.others.3] rootState 中间路径词跳转 — 点击 user 应跳转到 user 模块文件
    rootState.user.roles; // <- 光标放 user 上
  },
  /**
   * 示例：dispatch 空字符串测试
   */
  async testDispatch({ dispatch }) {
    dispatch("");
  },
};

const getters = {
  /** 获取完整产品信息 */
  productInfo: (state) => ({
    name: state.productName,
    version: state.version,
  }),
  /** 是否为暗色主题 */
  isDarkMode: (state) => state.theme === "dark",
  /** 是否为自动主题 */
  isAutoTheme: (state) => state.theme === "auto",
  /** 获取当前语言的显示名称 */
  languageDisplay: (state) => {
    const map = {
      "zh-CN": "简体中文",
      "en-US": "English",
      "ja-JP": "日本語",
    };
    return map[state.language] || state.language;
  },
  /** 通知是否启用 */
  hasNotifications: (state) => state.notifications,
};

export default {
  namespaced: true,
  state,
  getters,
  mutations,
  actions,
};
