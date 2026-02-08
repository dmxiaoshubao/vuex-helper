<template>
  <div id="app">
    <h1>Vuex Helper Examples</h1>

    <section>
      <h2>Root Store</h2>
      <p>Count: {{ count }}</p>
      <p>Is Logged In: {{ isLoggedIn }}</p>
      <p>Preferences: {{ preferences }}</p>
      <button @click="increment">Increment</button>
      <button @click="incrementAsync">Increment Async</button>
      <button @click="login({ username: 'user', password: 'password' })">
        Login
      </button>
      <button @click="updatePreferences({ theme: 'light' })">
        Set Light Theme
      </button>
    </section>

    <section>
      <h2>User Module (Namespaced)</h2>
      <p>Name: {{ name }} (Upper: {{ upperName }})</p>
      <p>Age: {{ userAge }}</p>
      <p>Is Admin: {{ isAdmin }}</p>
      <p>Is Active: {{ isActive }}</p>

      <div v-if="hasRole('admin')">Admin Area</div>

      <button @click="updateName('Jane Doe')">Update Name</button>
      <button @click="fetchProfile">Fetch Profile</button>
      <button @click="toggleActive">Toggle Active</button>
      <button @click="logout">Logout</button>
      <button @click="addRole('admin')">Add Admin Role</button>
    </section>
  </div>
</template>

<script>
import { mapState, mapGetters, mapMutations, mapActions } from "vuex";

export default {
  name: "App",
  computed: {
    // --- Root State ---
    ...mapState(["count", "isLoggedIn", "preferences", "items"]),

    ...mapState("user", ["age", "name", "preferences"]),
    ...mapGetters("others", ["isAdmin", ""]),

    ...mapState("user", {
      age: "age",
    }),

    ...mapGetters(["others/hasRole", "others/isAdmin"]),

    // --- User Module State ---
    ...mapState("user", ["name", "age", "roles", "isActive"]),

    // --- Root Getters ---
    ...mapGetters(["isLoggedIn", "getItemById"]),

    // --- User Module Getters ---
    ...mapGetters("user", ["upperName", "userAge", "hasRole", "isAdmin"]),

    // Direct Access Examples (for testing hover/jump)
    directStoreAccess() {
      // Root
      console.log(this.$store.state.count);
      console.log(this.$store.getters.isLoggedIn);

      // Module
      console.log(this.$store.state.user.name);
      console.log(this.$store.getters["user/upperName"]);
    },
  },
  created() {
    this.name;
    this.upperName;
  },
  methods: {
    // --- Root Mutations ---
    ...mapMutations([
      "increment",
      "SET_LOGIN_STATUS",
      "UPDATE_PREFERENCES",
      "addItem",
    ]),

    // --- User Module Mutations ---
    ...mapMutations("user", [
      "SET_NAME",
      "SET_AGE",
      "ADD_ROLE",
      "toggleActive",
      "SET_PROFILE",
    ]),
    // Alias example
    ...mapMutations("user", {
      addRole: "ADD_ROLE",
    }),

    // --- Root Actions ---
    ...mapActions(["incrementAsync", "login", "updatePreferences"]),
    ...mapMutations(["others/ADD_ROLE", "others/SET_AGE"]),

    // --- User Module Actions ---
    ...mapActions("user", [
      "updateName",
      "updateInfoAsync",
      "fetchProfile",
      "logout",
    ]),
    ...mapMutations(["others/ADD_ROLE"]),

    // Standard method to test direct dispatch/commit
    testDirectCalls() {
      // Root
      this.$store.commit("increment");
      this.$store.dispatch("incrementAsync");

      // Module
      this.$store.commit("user/SET_NAME", "Direct Name");
      this.$store.dispatch("user/updateName", "Direct Action");
    },

    testBracketNotation() {
      // Should autocomplete to: this['others/ADD_ROLE']()
      // this.ot... ->
      this["others/ADD_ROLE"]("admin");

      // Should autocomplete to: this['others/SET_AGE']()
      this["others/SET_AGE"](30);

      // Should autocomplete to: this['others/isAdmin']
      console.log(this["others/isAdmin"]);
    },
  },
};
</script>
