<script setup>
import logo from './assets/logo.svg'
import github from './assets/github.svg'
import {useRouter} from "vitepress";

const router = useRouter()

const handleBackHome = () => {
  router.go('/')
}

const handleLinkGithub = () => {
  window.location.href = 'https://github.com/Zz-ZzzZ'
}
</script>

<template>
  <div class="header">
    <span class="header-title" @click="handleBackHome">
      <img :src="logo" alt="" class="header-icon">
      Zz-ZzzZ
    </span>
    <div @click="handleLinkGithub">
      <img :src="github" class="header-github" alt="">
    </div>
  </div>
  <div class="header-divider"></div>
</template>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-icon {
  width: 20px;
  display: inline-block;
  vertical-align: top;
}

.header-title {
  font-weight: 550;
  font-size: 20px;
  cursor: pointer;
}

.header-tag > span {
  margin-right: 25px;
  font-size: 14px;
}

.header-tag > span:last-child {
  margin: 0;
}

.header-divider {
  border-top: 1px solid var(--vp-c-divider);
  margin: 20px 0;
}

.header-github {
  cursor: pointer;
  width: 23px;
}

@media screen and (max-width: 640px) {
  .header-tag > span {
    margin-right: 15px;
    font-size: 14px;
  }

  .header-divider {
    margin: 10px 0;
  }
}
</style>
