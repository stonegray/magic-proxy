import express from 'express';
import Docker from 'dockerode';

export function createApp(docker: Docker) {
    const app = express();

    app.use(express.json());

    app.get('/', (_req, res) => {
        res.send({ message: 'Docker management API', version: '0.1.0' });
    });


    return app;
}