<template>
  <div id="app">
    <p>Count: {{ count }}</p>
    <p>Name: {{ name }}</p>
    <button @click="increment">Increment</button>
    <button @click="incrementAsync">Increment Async</button>
    <button @click="updateName('Jane Doe')">Update Name</button>
  </div>
</template>

<script>
import { mapState, mapGetters, mapMutations, mapActions } from "vuex";

export default {
  name: "App",
  computed: {
    // 1. Direct access check (not yet supported by current provider logic, but good for future)
    directCount() {
      return this.$store.state.count;
    },

    // 2. mapState
    ...mapState(["count"]),
    ...mapState("user", ["name"]), // Namespaced

    // 3. mapGetters (assuming we add getters to store later)
    ...mapGetters(["doubleCount"]),
    ...mapGetters("user", ["upperName"]),
  },
  methods: {
    // 4. mapMutations
    ...mapMutations(["increment"]),
    ...mapMutations("user", ["SET_NAME"]),

    // 5. mapActions
    ...mapActions(["incrementAsync"]),
    ...mapActions("user", ["updateName"]),

    testDirectCall() {
      // 6. Direct dispatch/commit
      this.$store.commit("increment");
      this.$store.dispatch("incrementAsync");

      this.$store.commit("user/SET_NAME", "Bob");
      this.$store.dispatch("user/updateName", "Alice");
    },
  },
};
</script>
