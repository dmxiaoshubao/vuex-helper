<template>
  <div>{{ appName }}</div>
</template>

<script>
import { mapState, mapMutations, mapActions } from "vuex";

export default {
  data() {
    return {
      /**
       * 本地数据
       */
      localAppName: "Custom Entry App",
    };
  },
  computed: {
    ...mapState(["appName"]),
  },
  methods: {
    ...mapMutations(["SET_APP_NAME"]),
    ...mapActions(["setAppNameAsync"]),
    test() {
      this.SET_APP_NAME("New Name");
      this.setAppNameAsync("New Name Async");
    },
  },
};
</script>
