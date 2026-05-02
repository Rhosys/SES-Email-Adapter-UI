import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { useThemeStore } from './stores/theme';
import { useAccountStore } from './stores/account';
import './assets/main.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

// Hydrate persisted state before mount so initial render uses the right theme.
useThemeStore().hydrate();
useAccountStore().hydrate();

app.mount('#app');
