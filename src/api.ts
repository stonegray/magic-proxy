import express from 'express';
import Docker from 'dockerode';

export function createApp(docker: Docker) {
    const app = express();

    app.use(express.json());

    app.get('/', (_req, res) => {
        res.send({ message: 'Docker management API', version: '0.1.0' });
    });

    // List containers
    app.get('/containers', async (_req, res) => {
        try {
            const containers = await docker.listContainers({ all: true });
            res.json(containers);
        } catch (err) {
            console.error('Error listing containers:', err);
            res.status(500).json({ error: 'Failed to list containers' });
        }
    });

    // Start container
    app.post('/containers/:id/start', async (req, res) => {
        const { id } = req.params;
        try {
            const container = docker.getContainer(id);
            await container.start();
            res.json({ id, status: 'started' });
        } catch (err) {
            console.error('Error starting container:', err);
            res.status(500).json({ error: 'Failed to start container' });
        }
    });

    // Stop container
    app.post('/containers/:id/stop', async (req, res) => {
        const { id } = req.params;
        try {
            const container = docker.getContainer(id);
            await container.stop();
            res.json({ id, status: 'stopped' });
        } catch (err) {
            console.error('Error stopping container:', err);
            res.status(500).json({ error: 'Failed to stop container' });
        }
    });

    return app;
}