import { executeTool, resolveConfirmation } from '../tools/handlers.js';

export function registerToolRoutes(app) {
  app.post('/api/tools/:name', async (req, res) => {
    try {
      const result = await executeTool(req.params.name, req.body);
      res.json(result);
    } catch (err) {
      console.error(`Tool ${req.params.name} error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/confirm', async (req, res) => {
    const { action_id, approved } = req.body;
    try {
      const result = await resolveConfirmation(action_id, approved);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
