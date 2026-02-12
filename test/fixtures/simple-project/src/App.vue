<template>
  <div id="app">
    <h1>Vuex Helper - All Completion Test Cases</h1>

    <!-- ========== Section 1: mapState 测试 ========== -->
    <section>
      <h2>1. mapState 补全测试</h2>
      <p>Count: {{ count }}</p>
    </section>

    <!-- ========== Section 2: mapGetters 测试 ========== -->
    <section>
      <h2>2. mapGetters 补全测试</h2>
      <p>Is Logged In: {{ isLoggedIn }}</p>
    </section>

    <!-- ========== Section 3: mapMutations 测试 ========== -->
    <section>
      <h2>3. mapMutations 补全测试</h2>
      <button @click="increment">Increment</button>
    </section>

    <!-- ========== Section 4: mapActions 测试 ========== -->
    <section>
      <h2>4. mapActions 补全测试</h2>
      <button @click="incrementAsync">Increment Async</button>
    </section>
  </div>
</template>

<script>
import { mapState, mapGetters, mapMutations, mapActions } from "vuex";

export default {
  name: "App",

  computed: {
    // ========================================
    // 1. mapState 补全测试用例
    // ========================================

    // [1.1] 数组语法 - 根模块 state
    // 测试: 在引号内输入，应显示 count, isLoggedIn, preferences 等
    ...mapState(["count", 'isLoggedIn', 'items']), // <- 光标放引号内，测试根 state 补全

    // [1.2] 数组语法 - 命名空间模块 state (user)
    // 测试: 在引号内输入，应只显示 user 模块的 state: name, age, roles, isActive
    ...mapState("user", ["name", "age"]), // <- 光标放引号内

    // [1.3] 数组语法 - 命名空间模块 state (others)
    // 测试: 在引号内输入，应只显示 others 模块的 state: productName, version, theme, language, notifications, lastUpdated
    ...mapState("others", ["productName", "theme", 'language', 'notifications']), // <- 光标放引号内

    // [1.4] 对象语法 - 别名映射
    // 测试: 在值引号内输入，应显示 state 列表
    ...mapState({
      myCount: "count", // <- 光标放引号内，选择后应为 "count"
      myTheme: "others/theme", // <- 光标放引号内
    }),

    // [1.5] 带路径的 state 名称 (user 模块)
    // 测试: 输入 "user/" 应显示 user 模块的 state
    ...mapState(["user/name", "user/age"]), // <- 光标放斜杠后

    // [1.6] 带路径的 state 名称 (others 模块)
    // 测试: 输入 "others/" 应显示 others 模块的 state: productName, version, theme, language, notifications, lastUpdated
    ...mapState(["others/theme", "others/language"]), // <- 光标放斜杠后

    // [1.7] mapState 第一个参数 - 模块名补全
    // 测试: 在第一个参数引号内，应显示可用模块: user, others
    ...mapState("user", ["name"]), // <- 光标放第一个引号内
    ...mapState("others", ["productName"]), // <- 光标放第一个引号内

    // --- 实际使用的 mapState ---
    ...mapState(["count", "isLoggedIn", "preferences", "items"]),
    ...mapState("user", ["name", "age", "roles", "isActive"]),
    ...mapState("others", ["productName", "version", "theme", "language"]),
    ...mapState({
      aliasCount: "count",
      aliasTheme: "others/language",
      count: 'count',
      lastUpdated: 'others/theme',
    }),

    // ========================================
    // 1.8 mapState 函数语法 - state 参数补全
    // ========================================

    // [1.8.1] 箭头函数中的 state. 补全
    // 测试: 输入 state. 后应显示根 state: count, isLoggedIn, user, others 等
    ...mapState({
      arrowCount: state => state.count, // <- 光标放点后
    }),

    // [1.8.2] 箭头函数中带前缀
    // 测试: 输入 state.c 后应过滤显示 count
    ...mapState({
      arrowCount2: state => state.count, // <- 光标放 c 后
    }),

    // [1.8.3] 箭头函数中访问 user 模块 state
    // 测试: 输入 state.user. 后应显示 user 模块的 state: name, age, roles, isActive
    ...mapState({
      userName: state => state.user.name, // <- 光标放点后
    }),

    // [1.8.4] 箭头函数中访问 others 模块 state
    // 测试: 输入 state.others. 后应显示 others 模块的 state: productName, version, theme, language 等
    ...mapState({
      appTheme: state => state.others.notifications, // <- 光标放点后
    }),

    // [1.8.5] 普通函数语法
    // 测试: 在函数体内的 state. 补全
    ...mapState({
      normalCount(state) {
        return state.count; // <- 光标放点后
      },
    }),

    // [1.8.6] 普通函数带前缀
    ...mapState({
      normalCount2(state) {
        return state.count; // <- 光标放 c 后
      },
    }),

    // [1.8.7] 普通函数访问 others 模块
    ...mapState({
      normalTheme(state) {
        return state.others.theme; // <- 光标放点后
      },
    }),

    // ========================================
    // 2. mapGetters 补全测试用例
    // ========================================

    // [2.1] 数组语法 - 根模块 getters
    // 测试: 在引号内输入，应显示 isLoggedIn, getItemById 等
    ...mapGetters(["isLoggedIn", "getItemById"]), // <- 光标放引号内

    // [2.2] 数组语法 - 命名空间模块 getters (user)
    // 测试: 在引号内输入，应只显示 user 模块的 getters: upperName, userAge, hasRole, isAdmin
    ...mapGetters("user", ["upperName", "hasRole"]), // <- 光标放引号内

    // [2.3] 数组语法 - 命名空间模块 getters (others)
    // 测试: 在引号内输入，应只显示 others 模块的 getters: productInfo, isDarkMode, isAutoTheme, languageDisplay, hasNotifications
    ...mapGetters("others", ["isDarkMode", "languageDisplay"]), // <- 光标放引号内

    // [2.4] 对象语法
    // 测试: 在值引号内输入
    ...mapGetters({
      myIsLoggedIn: "isLoggedIn", // <- 光标放引号内
      myIsDark: "others/isDarkMode", // <- 光标放引号内
    }),

    // [2.5] 带路径的 getter 名称 (user)
    // 测试: 输入 "user/" 应显示 user 模块的 getters
    ...mapGetters(["user/upperName"]), // <- 光标放斜杠后

    // [2.6] 带路径的 getter 名称 (others)
    // 测试: 输入 "others/" 应显示 others 模块的 getters: productInfo, isDarkMode, isAutoTheme, languageDisplay, hasNotifications
    ...mapGetters(["others/isDarkMode", "others/hasNotifications"]), // <- 光标放斜杠后

    // [2.7] mapGetters 第一个参数 - 模块名补全
    ...mapGetters("user", [""]), // <- 光标放第一个引号内
    ...mapGetters("others", [""]), // <- 光标放第一个引号内

    // --- 实际使用的 mapGetters ---
    ...mapGetters(["isLoggedIn", "getItemById"]),
    ...mapGetters("user", ["upperName", "userAge", "hasRole", "isAdmin"]),
    ...mapGetters("others", ["isDarkMode", "languageDisplay", "hasNotifications"]),

    // ========================================
    // 3. this.$store.state.xxx 点号访问测试
    // ========================================

    testStateAccess() {
      // [3.1] 根 state 点号访问
      // 测试: 输入 this.$store.state. 后应显示 count, isLoggedIn, user, others 等
      this.$store.state['others/language']; // <- 光标放点后

      // [3.2] 根 state 带前缀
      // 测试: 输入 this.$store.state.c 后应过滤显示 count
      this.$store.state.count; // <- 光标放 c 后

      // [3.3] user 模块 state 点号访问
      // 测试: 输入 this.$store.state.user. 后应显示 name, age, roles, isActive
      this.$store.state.others.notifications; // <- 光标放点后

      // [3.4] others 模块 state 点号访问
      // 测试: 输入 this.$store.state.others. 后应显示 productName, version, theme, language, notifications, lastUpdated
      this.$store.state.others.lastUpdated; // <- 光标放点后

      // 实际调用
      return this.$store.state.count + this.$store.state.user.name + this.$store.state.others.theme;
    },

    // ========================================
    // 4. this.$store.getters.xxx 点号访问测试
    // ========================================

    testGettersAccess() {
      // [4.1] 根 getters 点号访问
      // 测试: 输入 this.$store.getters. 后应显示 isLoggedIn, getItemById 等
      this.$store.getters['others/hasNotifications']; // <- 光标放点后

      // [4.2] 根 getters 带前缀
      // 测试: 输入 this.$store.getters.is 后应过滤显示 isLoggedIn
      this.$store.getters['others/isAutoTheme']; // <- 光标放 s 后

      // 实际调用
      return this.$store.getters.isLoggedIn;
    },

    // ========================================
    // 5. this.$store.state['xxx'] 方括号访问测试
    // ========================================

    testStateBracketAccess() {
      // [5.1] 根 state 方括号访问
      // 测试: 输入 this.$store.state[' 后应显示 state 列表
      this.$store.state['count']; // <- 光标放引号内

      // [5.2] 带路径的 state (user)
      // 测试: 输入 user/ 后应显示 user 模块的 state
      this.$store.state['user/age']; // <- 光标放斜杠后

      // [5.3] 带路径的 state (others)
      // 测试: 输入 others/ 后应显示 others 模块的 state
      this.$store.state['others/productName']; // <- 光标放斜杠后

      // 实际调用
      return this.$store.state['user/name'] + this.$store.state['others/theme'];
    },

    // ========================================
    // 6. this.$store.getters['xxx'] 方括号访问测试
    // ========================================

    testGettersBracketAccess() {
      // [6.1] 根 getters 方括号访问
      // 测试: 输入 this.$store.getters[' 后应显示 getters 列表
      this.$store.getters['getItemById']; // <- 光标放引号内

      // 实际调用
      return this.$store.getters['user/upperName'] + this.$store.getters['others/isDarkMode'];
    },
  },

  methods: {
    // ========================================
    // 7. mapMutations 补全测试用例
    // ========================================

    // [7.1] 数组语法 - 根模块 mutations
    // 测试: 在引号内输入，应显示 increment, SET_LOGIN_STATUS 等
    ...mapMutations(["increment", 'others/RESET_SETTINGS']), // <- 光标放引号内

    // [7.2] 数组语法 - 命名空间模块 mutations (user)
    // 测试: 在引号内输入，应只显示 user 模块的 mutations: SET_NAME, SET_AGE, ADD_ROLE, toggleActive, SET_PROFILE
    ...mapMutations("user", ["SET_AGE"]), // <- 光标放引号内

    // [7.3] 数组语法 - 命名空间模块 mutations (others)
    // 测试: 在引号内输入，应只显示 others 模块的 mutations: SET_PRODUCT_NAME, SET_VERSION, toggleTheme, SET_THEME, SET_LANGUAGE, toggleNotifications, RESET_SETTINGS
    ...mapMutations("others", ["RESET_SETTINGS"]), // <- 光标放引号内

    // [7.4] 对象语法
    // 测试: 在值引号内输入
    ...mapMutations({
      myIncrement: "increment", // <- 光标放引号内
      RESET_SETTINGS: 'others/RESET_SETTINGS',
    }),

    // [7.5] 带路径的 mutation 名称 (user)
    ...mapMutations(["user/ADD_ROLE"]), // <- 光标放斜杠后

    // [7.6] 带路径的 mutation 名称 (others)
    // 测试: 输入 "others/" 应显示 others 模块的 mutations
    ...mapMutations(["others/SET_PRODUCT_NAME"]), // <- 光标放斜杠后

    // [7.7] mapMutations 第一个参数 - 模块名补全
    ...mapMutations("others", ["SET_PRODUCT_NAME"]), // <- 光标放第一个引号内

    // --- 实际使用的 mapMutations ---
    ...mapMutations(["increment", "SET_LOGIN_STATUS", "UPDATE_PREFERENCES", "addItem"]),
    ...mapMutations("user", ["SET_NAME", "SET_AGE", "ADD_ROLE", "toggleActive", "SET_PROFILE"]),
    ...mapMutations("user", {
      addRole: "ADD_ROLE",
    }),
    ...mapMutations("others", ["SET_PRODUCT_NAME", "SET_VERSION", "toggleTheme", "SET_LANGUAGE", "toggleNotifications"]),
    ...mapMutations(["others/SET_THEME", "others/RESET_SETTINGS"]),

    // ========================================
    // 8. mapActions 补全测试用例
    // ========================================

    // [8.1] 数组语法 - 根模块 actions
    // 测试: 在引号内输入，应显示 incrementAsync, login, updatePreferences 等
    ...mapActions(["incrementAsync"]), // <- 光标放引号内

    // [8.2] 数组语法 - 命名空间模块 actions (user)
    // 测试: 在引号内输入，应只显示 user 模块的 actions: updateName, updateInfoAsync, fetchProfile, logout 等
    ...mapActions("user", ["callRootAction"]), // <- 光标放引号内

    // [8.3] 数组语法 - 命名空间模块 actions (others)
    // 测试: 在引号内输入，应只显示 others 模块的 actions: updateProductName, updateVersion, changeTheme, updateLanguage, factoryReset 等
    ...mapActions("others", ["testDispatch"]), // <- 光标放引号内

    // [8.4] 对象语法
    // 测试: 在值引号内输入
    ...mapActions({
      myLogin: "login", // <- 光标放引号内
    }),

    // [8.5] 带路径的 action 名称 (user)
    ...mapActions(["user/callRootAction"]), // <- 光标放斜杠后

    // [8.6] 带路径的 action 名称 (others)
    // 测试: 输入 "others/" 应显示 others 模块的 actions
    ...mapActions(["others/changeTheme"]), // <- 光标放斜杠后

    // [8.7] mapActions 第一个参数 - 模块名补全
    ...mapActions("others", ["factoryReset"]), // <- 光标放第一个引号内

    // --- 实际使用的 mapActions ---
    ...mapActions(["incrementAsync", "login", "updatePreferences"]),
    ...mapActions("user", ["updateName", "updateInfoAsync", "fetchProfile", "logout"]),
    ...mapActions("others", ["updateProductName", "updateVersion", "changeTheme", "updateLanguage", "factoryReset"]),

    // ========================================
    // 9. this.$store.commit 补全测试
    // ========================================

    testCommit() {
      // [9.1] commit 第一个参数 - mutation 名称
      // 测试: 在引号内输入，应显示所有 mutations
      this.$store.commit("addItem"); // <- 光标放引号内

      // [9.2] commit 带前缀
      // 测试: 输入 SET_ 后应过滤显示 SET_ 开头的 mutations
      this.$store.commit("SET_LOGIN_STATUS"); // <- 光标放下划线后

      // [9.3] commit 带模块路径 (user)
      // 测试: 输入 user/ 后应显示 user 模块的 mutations
      this.$store.commit("user/ADD_ROLE"); // <- 光标放斜杠后

      // [9.4] commit 带模块路径 (others)
      // 测试: 输入 others/ 后应显示 others 模块的 mutations
      this.$store.commit("others/SET_THEME"); // <- 光标放斜杠后

      // 实际调用
      this.$store.commit("increment");
      this.$store.commit("user/SET_NAME", "New Name");
      this.$store.commit("others/SET_THEME", "dark");
    },

    // ========================================
    // 10. this.$store.dispatch 补全测试
    // ========================================

    testDispatch() {
      // [10.1] dispatch 第一个参数 - action 名称
      // 测试: 在引号内输入，应显示所有 actions
      this.$store.dispatch("incrementAsync"); // <- 光标放引号内

      // [10.2] dispatch 带前缀
      // 测试: 输入 login 后应过滤
      this.$store.dispatch("login"); // <- 光标放 g 后

      // [10.3] dispatch 带模块路径 (user)
      // 测试: 输入 user/ 后应显示 user 模块的 actions
      this.$store.dispatch("user/callRootAction"); // <- 光标放斜杠后

      // [10.4] dispatch 带模块路径 (others)
      // 测试: 输入 others/ 后应显示 others 模块的 actions
      this.$store.dispatch("others/testDispatch"); // <- 光标放斜杠后

      // 实际调用
      this.$store.dispatch("incrementAsync");
      this.$store.dispatch("user/updateName", "New Name");
      this.$store.dispatch("others/changeTheme", "dark");
    },

    // ========================================
    // 11. this.xxx 映射属性补全测试
    // ========================================

    testMappedProperties() {
      // [11.1] this. 后应显示所有映射的 state/getters/mutations/actions
      // 测试: 输入 this. 后应显示 count, isLoggedIn, increment, incrementAsync 等
      // this.; // <- 光标放点后

      // [11.2] this.c 应过滤显示 c 开头的映射属性
      // 测试: 应显示 count 等
      this.c; // <- 光标放 c 后

      // [11.3] this.i 应过滤显示 isLoggedIn, increment 等
      this.increment(); // <- 光标放 i 后
      this['others/hasNotifications']

      // [11.4] 带斜杠的映射属性（方括号访问）- user
      // 测试: 输入 this['user/ 应显示 user 模块的映射
      this['user/']; // <- 光标放斜杠后

      // [11.5] 带斜杠的映射属性（方括号访问）- others
      // 测试: 输入 this['others/ 应显示 others 模块的映射: others/SET_THEME, others/changeTheme 等
      this['others/']; // <- 光标放斜杠后

      // 实际调用
      console.log(this.count);
      console.log(this.isLoggedIn);
      console.log(this.name);
      console.log(this.theme); // others 模块的 theme
      this.a1()
      this.increment();
      this.incrementAsync();
      this["others/SET_THEME"]("dark");
      this["others/changeTheme"]("light");
    },

    // ========================================
    // 12. vm.xxx 映射属性补全测试 (与 this. 相同)
    // ========================================

    testVmProperties() {
      const vm = this;
      // [12.1] vm. 后应显示所有映射的属性
      // vm.; // <- 光标放点后

      // 实际调用
      console.log(vm.count);
      console.log(vm.theme);
    },

    // ========================================
    // 13. 嵌套在对象中的 mapHelper 补全测试
    // ========================================

    ...mapMutations({
      m1: "addItem", // <- 光标放引号内
    }),

    ...mapActions({
      a1: "login", // <- 光标放引号内
    }),
  },

  created() {
    // ========================================
    // 14. 生命周期钩子中的 this. 补全
    // ========================================
    this.addRole()
    this.age
    this.callRootAction()

    // [14.1] created 中 this. 补全
    this['others/changeTheme'](); // <- 光标放点后，应显示所有映射属性

    // [14.2] 不完整的 this. 语句（测试代码预处理修复）
    // 这是之前 bug 的复现场景
    this['others/changeTheme']()
    // <- 光标放这里，应该仍能显示补全列表
    this.$store.dispatch('incrementAsync')
    this.$store.commit('increment')

    // [14.3] 另一个不完整语句测试
    this.addRole()
  },

  mounted() {
    // [14.4] mounted 中 this. 补全
    this.ADD_ROLE(); // <- 光标放点后
  },
};
</script>

<style>
section {
  margin: 20px 0;
  padding: 15px;
  border: 1px solid #ddd;
  border-radius: 8px;
}

h2 {
  color: #42b983;
  border-bottom: 2px solid #42b983;
  padding-bottom: 5px;
}

/* 高亮测试标记 */
.test-marker {
  background-color: #fff3cd;
  padding: 2px 5px;
  border-radius: 3px;
  font-family: monospace;
}
</style>
