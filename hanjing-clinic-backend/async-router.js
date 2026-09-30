import express from 'express';

export function createAsyncRouter() {
  const router = express.Router();
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const register = router[method].bind(router);
    router[method] = (path, ...handlers) => register(path, ...handlers.flat().map(handler => (req, res, next) => {
      try { Promise.resolve(handler(req, res, next)).catch(next); } catch (error) { next(error); }
    }));
  }
  return router;
}
