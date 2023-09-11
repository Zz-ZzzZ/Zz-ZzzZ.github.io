<script setup>
import { Content } from 'vitepress'
import 'vitepress/dist/client/theme-default/styles/vars.css'
import 'vitepress/dist/client/theme-default/styles/base.css'
import 'vitepress/dist/client/theme-default/styles/fonts.css'
import 'vitepress/dist/client/theme-default/styles/components/vp-doc.css'
</script>

<template>
  <div class="home">
    <Content class="vp-doc"/>
  </div>
</template>

<style>
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
