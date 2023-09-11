<script setup lang="ts">
import Header from './Header.vue';
import { Content, useData, useRoute } from 'vitepress'
import 'vitepress/dist/client/theme-default/styles/vars.css'
import 'vitepress/dist/client/theme-default/styles/base.css'
import 'vitepress/dist/client/theme-default/styles/fonts.css'
import 'vitepress/dist/client/theme-default/styles/components/vp-doc.css'
import 'vitepress/dist/client/theme-default/styles/components/vp-code.css'
import 'vitepress/dist/client/theme-default/styles/components/vp-code-group.css'
import 'vitepress/dist/client/theme-default/styles/components/custom-block.css'
import { onMounted, ref, watch } from 'vue';
import Home from './Home.vue';

const route = useRoute()

const { page } = useData()

const isRoot = ref(false)

const siteRef = ref()

const isMounted = ref(false)

onMounted(() => {
  setTimeout(() => {
    isMounted.value = true
  }, 500)
})

watch(() => route.path, (newPath) => {
  if (siteRef.value) {
    siteRef.value.scrollTop = 0
  }
  isRoot.value = newPath === '/'
}, { immediate: true })
</script>

<template>
  <div class="site">
    <div class="site-bg"/>
    <div class="site-container" ref="siteRef">
      <div class="site-main">
        <Header class="site-header"/>
        <Home v-show="isRoot && isMounted"/>
        <Content v-show="!isRoot && isMounted" class="vp-doc site-content"/>
      </div>
    </div>
  </div>
</template>

<style scoped>
.site {
  margin: 0;
  padding: 0;
  height: 100vh;
  font-family: var(--vp-font-family-base);
}

.site-bg {
  width: 100%;
  height: 100%;
  background-image: url("./assets/bg.svg");
  opacity: 0.05;
  position: absolute;
  z-index: -1;
}

.site-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden auto;
}

.site-main {
  width: 700px;
  height: 100%;
  border-radius: 10px;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.site-header {
  flex-shrink: 0;
}

.site-content {
  flex: 1;
}

@media screen and (max-width: 640px) {
  .site-main {
    width: 100%;
    height: 100%;
  }
}
</style>
<style>
body {
  margin: 0;
}

.vp-doc div[class*='language-'] {
  margin: 0;
}

.vp-doc .header-anchor {
  display: none;
}
</style>
