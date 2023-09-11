<script setup>
import { Content } from 'vitepress'
import 'vitepress/dist/client/theme-default/styles/vars.css'
import 'vitepress/dist/client/theme-default/styles/base.css'
import 'vitepress/dist/client/theme-default/styles/fonts.css'
import 'vitepress/dist/client/theme-default/styles/components/vp-doc.css'
import { onMounted, ref, Transition } from "vue";

const isMounted = ref(false)
onMounted(() => {
  setTimeout(() => {
    isMounted.value = true
  }, 200)
})
</script>

<template>
  <div class="home" :class="{'un-mounted': !isMounted}">
    <Transition>
      <Content v-if="isMounted" class="vp-doc"/>
    </Transition>
  </div>
</template>

<style>
.v-enter-to,
.v-leave-from {
  opacity: 1;
  transform: translateX(0);
}

.v-enter-active,
.v-leave-active {
  transition: all 0.5s ease;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.un-mounted {
  opacity: 0;
}

.home .vp-doc ul {
  list-style: none;
  padding-inline-start: 0;
}

.home .vp-doc a {
  color: var(--vp-c-text-light-2);
}

.home .vp-doc ul p {
  padding: 10px 20px;
  background: #ffffff;
  border-radius: 10px;
  box-shadow: rgba(0, 0, 0, 0.16) 0px 1px 4px;
}

@media screen and (max-width: 640px) {
  .home .vp-doc a {
    font-size: 14px;
  }

  .home .vp-doc ul p {
    padding: 7px 14px;
  }
}
</style>
