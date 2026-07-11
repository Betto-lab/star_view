const request = require('supertest');
const app = require('../server');
const conexion = require('../db');

describe('Pruebas del Servidor StarView', () => {
    // Cerramos la conexión a la base de datos después de todas las pruebas
    // para que Jest pueda finalizar correctamente.
    afterAll((done) => {
        conexion.end(done);
    });

    it('El endpoint raíz (/) debe devolver un mensaje de bienvenida o ser exitoso', async () => {
        const res = await request(app).get('/');
        // Puede que devuelva HTML si sirve la carpeta frontend, por lo tanto esperamos status 200
        expect(res.statusCode).toEqual(200);
    });

    it('La ruta de test Sentry (/debug-sentry) debe devolver error 500', async () => {
        const res = await request(app).get('/debug-sentry');
        expect(res.statusCode).toEqual(500);
    });
});
