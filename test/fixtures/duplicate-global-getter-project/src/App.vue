<template>
  <div>{{ total }}</div>
</template>

<script>
export default {
  computed: {
    total() {
      return this.$store.getters.sharedTotal;
    },
  },
};
</script>
