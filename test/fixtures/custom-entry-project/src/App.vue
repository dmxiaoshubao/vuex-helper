<template>
  <div>{{ appName }}</div>
</template>

<script>
import { mapState, mapMutations } from "vuex";

export default {
  computed: {
    ...mapState(["appName"]),
  },
  methods: {
    ...mapMutations(["SET_APP_NAME"]),
    test() {
      this.SET_APP_NAME("New Name");
    },
  },
};
</script>
