<script setup lang="ts">
import Header from './Header.vue';
import { Content } from 'vitepress'
import 'vitepress/dist/client/theme-default/styles/vars.css'
import 'vitepress/dist/client/theme-default/styles/base.css'
import 'vitepress/dist/client/theme-default/styles/fonts.css'
import 'vitepress/dist/client/theme-default/styles/components/vp-doc.css'
import 'vitepress/dist/client/theme-default/styles/components/vp-code.css'
import 'vitepress/dist/client/theme-default/styles/components/vp-code-group.css'
import 'vitepress/dist/client/theme-default/styles/components/custom-block.css'
</script>

<template>
  <div class="site">
    <div class="site-bg"/>
    <div class="site-container">
      <div class="site-main">
        <Header class="site-header"/>
        <Content class="vp-doc site-content"/>
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
  opacity: 0.1;
  position: absolute;
  z-index: -1;
}

.site-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.site-main {
  width: 700px;
  height: 90%;
  background: #ffffff;
  box-shadow: rgba(0, 0, 0, 0.16) 0px 10px 36px 0px, rgba(0, 0, 0, 0.06) 0px 0px 0px 1px;
  border-radius: 10px;
  padding: 30px;
  display: flex;
  flex-direction: column;
  overflow: hidden auto;

}

.site-header {
  flex-shrink: 0;
}

.site-content {
  flex: 1;
}

@media screen and (max-width: 640px){
  .site-main {
    width: 90%;
    height: 90%;
    padding: 20px 15px;
  }
}
</style>
<style>
body {
  margin: 0;
}

.vp-doc div[class*='language-']  {
  margin: 0;
}

.vp-doc a {
  color: var(--vp-c-yellow)
}
</style>
