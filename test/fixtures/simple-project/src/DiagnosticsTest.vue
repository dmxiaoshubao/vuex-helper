<template>
  <div></div>
</template>

<script>
import { mapState, mapGetters, mapMutations, mapActions } from "vuex";
/**
 * DiagnosticsTest.vue
 * 专门用于排查 VuexDiagnosticProvider 的测试文件。
 * 每行注释标注预期行为：[OK] = 不应报警，[WARN] = 应报警
 */
export default {
  computed: {
    // ---- 15.1 mapState ----
    // [OK]  根模块有效 state
    ...mapState(["count", "isLoggedIn", "items"]),
    // [OK]  命名空间有效 state
    ...mapState("user", ["name", "age"]),
    // [OK]  命名空间有效 state（others）
    ...mapState("others", ["theme", "language"]),
    // [WARN] 根模块不存在的 state
    ...mapState(["ghostState"]),
    // [WARN] 命名空间不存在的 state
    ...mapState("user", ["noSuchField", "ss"]),
    // [OK]  对象语法 value 有效（key 是别名，不诊断）
    ...mapState({ myCount: "count" }),
    // [WARN] 对象语法 value 无效
    ...mapState({ alias: "badState" }),
    // [OK]  函数体中的普通字符串不是 Vuex key，不应报警
    ...mapState({
      themeLabel(state) {
        return state.count > 0 ? "dark" : "light";
      },
    }),

    // ---- 15.2 mapGetters ----
    // [OK]  根模块有效 getter
    ...mapGetters(["isLoggedIn", "getItemById"]),
    // [OK]  命名空间有效 getter
    ...mapGetters("user", ["upperName", "hasRole", "displayName"]),
    // [WARN] 根模块不存在的 getter
    ...mapGetters(["noSuchGetter"]),
    // [WARN] 命名空间不存在的 getter
    ...mapGetters("others", ["badGetter"]),

    // ---- 15.7 $store.state 方括号访问 ----
    stateTests() {
      // [OK]  根模块有效 state
      const e1 = this.$store.state["count"];
      // [OK]  命名空间有效 state
      const e2 = this.$store.state["user/name"];
      const e3 = this.$store.state["others/theme"];
      // [WARN] 不存在的 state
      const e4 = this.$store.state["ghostState"];
      // [WARN] 命名空间不存在的 state
      const e5 = this.$store.state["user/noField"];
      return { e1, e2, e3, e4, e5 };
    },

    // ---- 15.8 $store.getters 方括号访问 ----
    getterTests() {
      // [OK]  根模块有效 getter
      const f1 = this.$store.getters["isLoggedIn"];
      // [OK]  命名空间有效 getter
      const f2 = this.$store.getters["user/upperName"];
      const f3 = this.$store.getters["others/isDarkMode"];
      // [WARN] 不存在的 getter
      const f4 = this.$store.getters["noSuchGetter"];
      // [WARN] 命名空间不存在的 getter
      const f5 = this.$store.getters["others/badGetter"];
      return { f1, f2, f3, f4, f5 };
    },

    // ---- 15.9 $store.state 点链访问 ----
    dotChainTests() {
      // [OK]  根模块有效 state（叶子节点）
      const g1 = this.$store.state.count;
      // [OK]  命名空间有效 state（叶子节点）
      const g2 = this.$store.state.user.name;
      const g3 = this.$store.state.others.theme;
      // [WARN] 叶子节点不存在
      const g4 = this.$store.state.others.noSuchField;
      // [OK]  preferences 对象有效子字段
      const g5 = this.$store.state.preferences.theme;
      // [OK]  preferences 是普通对象（非模块），子属性不诊断，即使不存在也不 WARN
      const g6 = this.$store.state.preferences.theme2;
      return { g1, g2, g3, g4, g5, g6 };
    },
  },

  methods: {
    // ---- 15.3 mapMutations ----
    // [OK]  根模块有效 mutation
    ...mapMutations(["increment", "SET_LOGIN_STATUS"]),
    // [OK]  命名空间有效 mutation
    ...mapMutations("others", ["SET_THEME", "RESET_SETTINGS"]),
    // [WARN] 根模块不存在的 mutation
    ...mapMutations(["NO_SUCH_MUTATION"]),
    // [WARN] 命名空间不存在的 mutation
    ...mapMutations("user", ["ADD_ROLE", "BAD_MUTATION", SETDISPA]),
    ...mapMutations("others", ["BAD_MUTATION2", "BAD_MUTATION3"]),

    // ---- 15.4 mapActions ----
    // [OK]  根模块有效 action
    ...mapActions(["incrementAsync", "login"]),
    // [OK]  命名空间有效 action
    ...mapActions("others", ["changeTheme", "factoryReset"]),
    // [WARN] 根模块不存在的 action
    ...mapActions(["noSuchAction"]),
    // [WARN] 命名空间不存在的 action
    ...mapActions("user", ["badAction"]),

    // ---- 15.5 commit ----
    commitTests() {
      // [OK]  根模块有效 mutation
      this.$store.commit("increment");
      // [OK]  命名空间有效 mutation
      this.$store.commit("user/SET_NAME", "test");
      this.$store.commit("others/SET_THEME", "dark");
      // [WARN] 不存在的 mutation
      this.$store.commit("NO_SUCH_MUTATION");
      // [WARN] 命名空间不存在的 mutation
      this.$store.commit("user/BAD_MUTATION");
    },

    // ---- 15.6 dispatch ----
    dispatchTests() {
      // [OK]  根模块有效 action
      this.$store.dispatch("incrementAsync");
      // [OK]  命名空间有效 action
      this.$store.dispatch("user/updateName", "test");
      this.$store.dispatch("others/changeTheme", "dark");
      // [WARN] 不存在的 action
      this.$store.dispatch("noSuchAction");
      // [WARN] 命名空间不存在的 action
      this?.$store?.dispatch("others/badAction");
      this.$store?.dispatch("others/badAction");
      const a = this;
      a.$store?.dispatch("others/badAction");
    },

    // ---- 15.11 非 Vuex 同名函数不触发诊断 ----
    localFunctionTests() {
      function dispatch(type) {
        return type;
      }
      function commit(type) {
        return type;
      }

      // [OK]  普通局部函数，不是 Vuex dispatch/commit
      dispatch("local-event");
      commit("local-mutation");
    },

    // ---- 15.10 注释行不触发诊断 ----
    // this.$store.commit('NO_SUCH_MUTATION_IN_COMMENT');
    // this.$store.dispatch('noSuchActionInComment');
    // ...mapState(['commentedGhostState'])
  },
};
</script>
