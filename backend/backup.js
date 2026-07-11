const fs = require("fs");
const path = require("path");
require("dotenv").config();

const conexion = require("./db");

const backupDir = path.join(__dirname, "../backups");

if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, {
        recursive: true
    });
}

const fecha = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

const archivoBackup = path.join(
    backupDir,
    `starview-backup-${fecha}.json`
);

const tablas = [
    "usuarios",
    "perfiles",
    "contenido",
    "planes",
    "suscripciones",
    "pagos",
    "mi_lista",
    "historial",
    "reproducciones_activas"
];

function consultarTabla(tabla) {
    return new Promise((resolve) => {
        conexion.query(`SELECT * FROM ${tabla}`, (error, resultados) => {
            if (error) {
                console.error(`Error al respaldar tabla ${tabla}:`, error.message);

                resolve({
                    tabla,
                    ok: false,
                    error: error.message,
                    registros: []
                });

                return;
            }

            resolve({
                tabla,
                ok: true,
                total: resultados.length,
                registros: resultados
            });
        });
    });
}

async function generarBackup() {
    console.log("Iniciando respaldo de base de datos StarView...");

    const respaldo = {
        proyecto: "StarView",
        fecha_generacion: new Date().toISOString(),
        descripcion: "Respaldo lógico generado desde Node.js sin necesidad de mysqldump.",
        tablas: {}
    };

    for (const tabla of tablas) {
        const resultado = await consultarTabla(tabla);

        respaldo.tablas[tabla] = {
            ok: resultado.ok,
            total: resultado.total || 0,
            error: resultado.error || null,
            registros: resultado.registros
        };
    }

    fs.writeFileSync(
        archivoBackup,
        JSON.stringify(respaldo, null, 4),
        "utf8"
    );

    console.log("Backup generado correctamente:");
    console.log(archivoBackup);

    conexion.end();
}

generarBackup().catch((error) => {
    console.error("Error general al generar backup:", error);
    process.exit(1);
});