import { createRouter, createWebHashHistory } from 'vue-router';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../pages/login/LoginPage.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/',
      component: () => import('../layouts/DefaultLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('../pages/dashboard/DashboardPage.vue'),
        },
        {
          path: 'bots',
          name: 'bots',
          component: () => import('../pages/bots/BotsListPage.vue'),
        },
        {
          path: 'bots/:id',
          name: 'bot-detail',
          component: () => import('../pages/bot-detail/BotDetailPage.vue'),
        },
        {
          path: 'tables',
          name: 'tables',
          component: () => import('../pages/tables/TablesPage.vue'),
        },
        {
          path: 'hands',
          name: 'hands',
          component: () => import('../pages/hands/HandsPage.vue'),
        },
        {
          path: 'strategies',
          name: 'strategies',
          component: () => import('../pages/strategies/StrategiesPage.vue'),
        },
        {
          path: 'logs',
          name: 'logs',
          component: () => import('../pages/logs/LogsPage.vue'),
        },
      ],
    },
  ],
});

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('accessToken');
  const isAuthenticated = !!token;

  // Если переход уже на /login — не редиректим
  if (to.path === '/login') {
    next();
    return;
  }

  // Если маршрут требует авторизации, а токена нет — на /login
  if (to.meta.requiresAuth && !isAuthenticated) {
    next({ path: '/login', replace: true });
    return;
  }

  next();
});

export default router;
