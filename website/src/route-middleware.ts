import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

/* The home page uses Starlight's splash template for its hero, but keeps the sidebar so the
   learning path is one click away, as on every other page. */
export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute;
  if (route.entry.data.template === 'splash' && route.entry.data.hero) route.hasSidebar = true;
});
