import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';

const FoundationHome = { template: '<section><h1>Administration Passion Cosmetic</h1><p>La fondation technique est prête.</p></section>' };

const router = createRouter({ history: createWebHistory('/admin'), routes: [{ path: '/', component: FoundationHome }] });
createApp({ template: '<router-view />' }).use(createPinia()).use(router).mount('#admin-app');
