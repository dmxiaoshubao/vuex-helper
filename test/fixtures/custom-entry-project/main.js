import Vue from "vue";
import App from "./App.vue";
import store from "@/my-store/store"; // Using alias to import custom store

new Vue({
  store,
  render: (h) => h(App),
}).$mount("#app");
