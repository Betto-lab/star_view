const express = require("express");
const cors = require("cors");
const axios = require("axios");
const bcrypt = require("bcrypt");
const path = require("path");
const dns = require("dns");

require("dotenv").config();

const conexion = require("./db");

const { MercadoPagoConfig, Preference } = require("mercadopago");

const clienteMP = process.env.MP_ACCESS_TOKEN
    ? new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })
    : null;

const TMDB_API_KEY = process.env.TMDB_API_KEY || "14848f0a935d7e54d7c8ced042603214";

const app = express();

const registrosPendientes = new Map();
const recuperacionesPerfil = new Map();
const recuperacionesCuenta = new Map();

function dominioAceptaCorreos(correo) {
    return new Promise((resolve) => {
        const dominio = correo.split("@")[1];

        dns.resolveMx(dominio, (error, direcciones) => {
            if (error || !direcciones || direcciones.length === 0) {
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });
}

function validarFormatoCorreo(correo) {
    const expresion = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return expresion.test(correo);
}

function validarSoloLetras(texto) {
    const expresion = /^[A-Za-záéíóúÁÉÍÓÚñÑ\s]+$/;
    return expresion.test(texto);
}

function validarPasswordSegura(password) {
    const tieneLongitud = password.length >= 8;
    const tieneNumero = /\d/.test(password);
    const tieneSimbolo = /[!@#$%^&*(),.?":{}|<>_\-+=/\\[\];'`~]/.test(password);

    return tieneLongitud && tieneNumero && tieneSimbolo;
}

function generarCodigoVerificacion() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function enviarCorreoVerificacion(correo, nombre, codigo, tipo = "registro") {
    const urlGoogleScript = "https://script.google.com/macros/s/AKfycbwoBuUvkjHGh0LWHiOJvZfg9HtkalQQNYeRLefQVPVYSXzoOxY_jzRGn342e-ox3NWO/exec";

    try {
        console.log(`[CORREO] Intentando enviar código ${codigo} a: ${correo} (Modo: ${tipo})`);

        const respuesta = await fetch(urlGoogleScript, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain"
            },
            body: JSON.stringify({
                correo,
                nombre,
                codigo,
                tipo
            }),
            redirect: "follow"
        });

        console.log(`[CORREO] Respuesta de Google HTTP: ${respuesta.status}`);

    } catch (error) {
        console.log("[CORREO ERROR] Falló la conexión con Google Script:", error.message);
        throw new Error("Fallo en la API de correos");
    }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

/* =========================
   REGISTRO Y LOGIN
========================= */

app.post("/recuperar-cuenta/iniciar", (req, res) => {
    const { correo } = req.body;

    conexion.query(
        "SELECT id, nombre FROM usuarios WHERE correo = ?",
        [correo],
        async (error, resultados) => {
            if (error) {
                return res.json({
                    ok: false,
                    mensaje: "Error del servidor al buscar el correo."
                });
            }

            if (resultados.length === 0) {
                return res.json({
                    ok: false,
                    mensaje: "Este correo no está registrado. Verifica si está bien escrito."
                });
            }

            const codigo = generarCodigoVerificacion();

            recuperacionesCuenta.set(correo, {
                codigo,
                creado: Date.now()
            });

            try {
                await enviarCorreoVerificacion(correo, resultados[0].nombre, codigo, "cuenta");

                res.json({
                    ok: true,
                    mensaje: "Código enviado exitosamente a tu correo."
                });

            } catch (errorCorreo) {
                console.log("Error al enviar correo de recuperación:", errorCorreo);

                res.json({
                    ok: false,
                    mensaje: "El servidor falló al intentar enviar el correo."
                });
            }
        }
    );
});

app.post("/recuperar-cuenta/confirmar", async (req, res) => {
    const { correo, codigo, nueva_password } = req.body;

    const peticion = recuperacionesCuenta.get(correo);

    if (!peticion || peticion.codigo !== codigo || Date.now() - peticion.creado > 10 * 60 * 1000) {
        return res.json({
            ok: false,
            mensaje: "Código inválido o expirado"
        });
    }

    try {
        const passwordHash = await bcrypt.hash(nueva_password, 10);

        conexion.query(
            "UPDATE usuarios SET password = ? WHERE correo = ?",
            [passwordHash, correo],
            (error) => {
                if (error) {
                    return res.json({
                        ok: false,
                        mensaje: "Error al actualizar contraseña"
                    });
                }

                recuperacionesCuenta.delete(correo);

                res.json({
                    ok: true,
                    mensaje: "Contraseña actualizada correctamente"
                });
            }
        );

    } catch (error) {
        console.log(error);

        res.json({
            ok: false,
            mensaje: "Error al proteger la nueva contraseña"
        });
    }
});

app.post("/registro", async (req, res) => {
    const { nombre, correo, password } = req.body;

    if (!nombre || !correo || !password) {
        return res.json({
            ok: false,
            mensaje: "Completa todos los campos"
        });
    }

    if (!validarSoloLetras(nombre)) {
        return res.json({
            ok: false,
            mensaje: "El nombre solo puede contener letras y espacios"
        });
    }

    if (!validarFormatoCorreo(correo)) {
        return res.json({
            ok: false,
            mensaje: "El formato del correo no es válido"
        });
    }

    if (!validarPasswordSegura(password)) {
        return res.json({
            ok: false,
            mensaje: "La contraseña debe tener mínimo 8 caracteres, 1 número y 1 símbolo"
        });
    }

    const esReal = await dominioAceptaCorreos(correo);

    if (!esReal) {
        return res.json({
            ok: false,
            mensaje: "El dominio del correo no existe o es temporal. Por favor, usa un correo real."
        });
    }

    try {
        conexion.query(
            "SELECT id FROM usuarios WHERE correo = ?",
            [correo],
            async (error, resultados) => {
                if (error) {
                    console.log("Error al verificar correo:", error);

                    return res.json({
                        ok: false,
                        mensaje: "Error al verificar el correo"
                    });
                }

                if (resultados.length > 0) {
                    return res.json({
                        ok: false,
                        mensaje: "Este correo ya está registrado"
                    });
                }

                const passwordHash = await bcrypt.hash(password, 10);
                const codigo = generarCodigoVerificacion();

                registrosPendientes.set(correo, {
                    nombre,
                    correo,
                    passwordHash,
                    codigo,
                    creado: Date.now()
                });

                try {
                    await enviarCorreoVerificacion(correo, nombre, codigo, "registro");

                    res.json({
                        ok: true,
                        mensaje: "Código de verificación enviado a tu correo"
                    });

                } catch (errorCorreo) {
                    console.log("Error al enviar correo de verificación:", errorCorreo);

                    registrosPendientes.delete(correo);

                    res.json({
                        ok: false,
                        mensaje: "No se pudo enviar el correo de verificación. Revisa la configuración."
                    });
                }
            }
        );

    } catch (error) {
        console.log("Error interno en registro:", error);

        res.json({
            ok: false,
            mensaje: "Error interno del servidor"
        });
    }
});

app.post("/registro/verificar", (req, res) => {
    const { correo, codigo } = req.body;

    if (!correo || !codigo) {
        return res.json({
            ok: false,
            mensaje: "Correo y código son obligatorios"
        });
    }

    const registro = registrosPendientes.get(correo);

    if (!registro) {
        return res.json({
            ok: false,
            mensaje: "No existe una solicitud de registro pendiente"
        });
    }

    const tiempoExpirado = Date.now() - registro.creado > 10 * 60 * 1000;

    if (tiempoExpirado) {
        registrosPendientes.delete(correo);

        return res.json({
            ok: false,
            mensaje: "El código expiró. Regístrate nuevamente"
        });
    }

    if (registro.codigo !== codigo) {
        return res.json({
            ok: false,
            mensaje: "El código de verificación es incorrecto"
        });
    }

    conexion.query(
        "SELECT id FROM usuarios WHERE correo = ?",
        [correo],
        (error, resultados) => {
            if (error) {
                console.log(error);

                return res.json({
                    ok: false,
                    mensaje: "Error al verificar usuario"
                });
            }

            if (resultados.length > 0) {
                registrosPendientes.delete(correo);

                return res.json({
                    ok: false,
                    mensaje: "Este correo ya está registrado"
                });
            }

            conexion.query(
                "INSERT INTO usuarios(nombre, correo, password) VALUES (?, ?, ?)",
                [registro.nombre, registro.correo, registro.passwordHash],
                (errorInsert, resultado) => {
                    if (errorInsert) {
                        console.log(errorInsert);

                        return res.json({
                            ok: false,
                            mensaje: "Error al registrar usuario"
                        });
                    }

                    registrosPendientes.delete(correo);

                    res.json({
                        ok: true,
                        mensaje: "Registro exitoso. Cuenta verificada correctamente",
                        usuario: {
                            id: resultado.insertId,
                            nombre: registro.nombre,
                            correo: registro.correo
                        }
                    });
                }
            );
        }
    );
});

app.post("/login", (req, res) => {
    const { correo, password } = req.body;

    if (!correo || !password) {
        return res.json({
            ok: false,
            mensaje: "Ingresa correo y contraseña"
        });
    }

    conexion.query(
        "SELECT * FROM usuarios WHERE correo = ?",
        [correo],
        async (error, resultados) => {
            if (error) {
                console.log(error);

                return res.json({
                    ok: false,
                    mensaje: "Error en el servidor"
                });
            }

            if (resultados.length === 0) {
                return res.json({
                    ok: false,
                    mensaje: "Correo no registrado"
                });
            }

            const usuario = resultados[0];

            let passwordValida = false;

            try {
                passwordValida = await bcrypt.compare(password, usuario.password);
            } catch (errorCompare) {
                passwordValida = false;
            }

            if (!passwordValida && password === usuario.password) {
                passwordValida = true;
            }

            if (!passwordValida) {
                return res.json({
                    ok: false,
                    mensaje: "Contraseña incorrecta"
                });
            }

            res.json({
                ok: true,
                mensaje: "Inicio de sesión correcto",
                usuario: {
                    id: usuario.id,
                    nombre: usuario.nombre,
                    correo: usuario.correo
                }
            });
        }
    );
});

/* =========================
   CONTENIDO
========================= */

app.get("/contenido", (req, res) => {
    conexion.query(
        "SELECT * FROM contenido WHERE COALESCE(activo, 1) = 1 ORDER BY id DESC",
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            res.json(resultados);
        }
    );
});

app.get("/contenido/perfil/:perfil_id", (req, res) => {
    const perfil_id = req.params.perfil_id;

    if (!perfil_id) {
        return res.json([]);
    }

    conexion.query(
        "SELECT * FROM contenido WHERE infantil = 1 AND COALESCE(activo, 1) = 1 ORDER BY id DESC",
        [perfil_id],
        (error, perfiles) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            if (perfiles.length === 0) {
                return res.json([]);
            }

            const esInfantil = Number(perfiles[0].infantil) === 1;

            let sql = "SELECT * FROM contenido";
            const parametros = [];

            if (esInfantil) {
                sql += " WHERE infantil = 1";
            }

            sql += " ORDER BY id DESC";

            conexion.query(sql, parametros, (errorContenido, resultados) => {
                if (errorContenido) {
                    console.log(errorContenido);
                    return res.json([]);
                }

                res.json(resultados);
            });
        }
    );
});

app.get("/contenido/:id", (req, res) => {
    const id = req.params.id;

    conexion.query(
        "SELECT * FROM contenido WHERE id = ?",
        [id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({});
            }

            if (resultados.length === 0) {
                return res.json({});
            }

            res.json(resultados[0]);
        }
    );
});

/* =========================
   PERFILES
========================= */

app.get("/perfiles/:usuario_id", (req, res) => {
    const usuario_id = req.params.usuario_id;

    conexion.query(
        `SELECT id, usuario_id, nombre, avatar, infantil
         FROM perfiles
         WHERE usuario_id = ?
         ORDER BY id ASC`,
        [usuario_id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            res.json(resultados);
        }
    );
});

app.post("/perfiles", (req, res) => {
    const { usuario_id, nombre, avatar, infantil, password_perfil } = req.body;

    if (!usuario_id || !nombre || !avatar || !password_perfil) {
        return res.json({
            ok: false,
            mensaje: "Completa nombre, avatar y contraseña del perfil"
        });
    }

    if (password_perfil.length < 4) {
        return res.json({
            ok: false,
            mensaje: "La contraseña del perfil debe tener mínimo 4 caracteres"
        });
    }

    conexion.query(
        "SELECT COUNT(*) AS total FROM perfiles WHERE usuario_id = ?",
        [usuario_id],
        async (error, resultados) => {
            if (error) {
                console.log(error);

                return res.json({
                    ok: false,
                    mensaje: "Error al verificar perfiles"
                });
            }

            if (resultados[0].total >= 5) {
                return res.json({
                    ok: false,
                    mensaje: "Solo puedes crear hasta 5 perfiles"
                });
            }

            const passwordHash = await bcrypt.hash(password_perfil, 10);

            conexion.query(
                `INSERT INTO perfiles(usuario_id, nombre, avatar, infantil, password_perfil)
                 VALUES (?, ?, ?, ?, ?)`,
                [usuario_id, nombre, avatar, infantil ? 1 : 0, passwordHash],
                (errorInsert) => {
                    if (errorInsert) {
                        console.log(errorInsert);

                        return res.json({
                            ok: false,
                            mensaje: "No se pudo crear el perfil"
                        });
                    }

                    res.json({
                        ok: true,
                        mensaje: "Perfil creado correctamente"
                    });
                }
            );
        }
    );
});

app.post("/perfiles/verificar", (req, res) => {
    const { usuario_id, perfil_id, password_perfil } = req.body;

    if (!usuario_id || !perfil_id || !password_perfil) {
        return res.json({
            ok: false,
            mensaje: "Ingresa la contraseña del perfil"
        });
    }

    conexion.query(
        `SELECT id, nombre, infantil, password_perfil
         FROM perfiles
         WHERE id = ? AND usuario_id = ?`,
        [perfil_id, usuario_id],
        async (error, resultados) => {
            if (error) {
                console.log(error);

                return res.json({
                    ok: false,
                    mensaje: "Error al verificar perfil"
                });
            }

            if (resultados.length === 0) {
                return res.json({
                    ok: false,
                    mensaje: "Perfil no encontrado"
                });
            }

            const perfil = resultados[0];

            if (!perfil.password_perfil) {
                return res.json({
                    ok: true,
                    mensaje: "Perfil sin contraseña configurada",
                    perfil: {
                        id: perfil.id,
                        nombre: perfil.nombre,
                        infantil: Number(perfil.infantil) === 1 ? 1 : 0
                    }
                });
            }

            const passwordValida = await bcrypt.compare(password_perfil, perfil.password_perfil);

            if (!passwordValida) {
                return res.json({
                    ok: false,
                    mensaje: "Contraseña de perfil incorrecta"
                });
            }

            res.json({
                ok: true,
                mensaje: "Perfil verificado correctamente",
                perfil: {
                    id: perfil.id,
                    nombre: perfil.nombre,
                    infantil: Number(perfil.infantil) === 1 ? 1 : 0
                }
            });
        }
    );
});

app.post("/perfiles/recuperar-iniciar", (req, res) => {
    const { usuario_id, perfil_id } = req.body;

    if (!usuario_id || !perfil_id) {
        return res.json({
            ok: false,
            mensaje: "Datos incompletos para recuperar contraseña"
        });
    }

    conexion.query(
        `SELECT 
            perfiles.id AS perfil_id,
            perfiles.nombre AS perfil_nombre,
            usuarios.nombre AS usuario_nombre,
            usuarios.correo AS usuario_correo
         FROM perfiles
         INNER JOIN usuarios ON perfiles.usuario_id = usuarios.id
         WHERE perfiles.id = ? AND perfiles.usuario_id = ?`,
        [perfil_id, usuario_id],
        async (error, resultados) => {
            if (error) {
                console.log(error);

                return res.json({
                    ok: false,
                    mensaje: "Error al buscar el perfil"
                });
            }

            if (resultados.length === 0) {
                return res.json({
                    ok: false,
                    mensaje: "Perfil no encontrado"
                });
            }

            const datos = resultados[0];
            const codigo = generarCodigoVerificacion();
            const clave = `${usuario_id}:${perfil_id}`;

            recuperacionesPerfil.set(clave, {
                usuario_id,
                perfil_id,
                codigo,
                creado: Date.now()
            });

            try {
                await enviarCorreoVerificacion(
                    datos.usuario_correo,
                    datos.usuario_nombre,
                    codigo,
                    "perfil"
                );

                res.json({
                    ok: true,
                    mensaje: "Código enviado al correo del usuario"
                });

            } catch (errorCorreo) {
                console.log("Error al enviar código de recuperación de perfil:", errorCorreo);

                recuperacionesPerfil.delete(clave);

                res.json({
                    ok: false,
                    mensaje: "No se pudo enviar el código de recuperación"
                });
            }
        }
    );
});

app.post("/perfiles/recuperar-confirmar", (req, res) => {
    const { usuario_id, perfil_id, codigo, nueva_password } = req.body;

    if (!usuario_id || !perfil_id || !codigo || !nueva_password) {
        return res.json({
            ok: false,
            mensaje: "Completa código y nueva contraseña"
        });
    }

    if (nueva_password.length < 4) {
        return res.json({
            ok: false,
            mensaje: "La nueva contraseña debe tener mínimo 4 caracteres"
        });
    }

    const clave = `${usuario_id}:${perfil_id}`;
    const recuperacion = recuperacionesPerfil.get(clave);

    if (!recuperacion) {
        return res.json({
            ok: false,
            mensaje: "No existe una solicitud de recuperación pendiente"
        });
    }

    const tiempoExpirado = Date.now() - recuperacion.creado > 10 * 60 * 1000;

    if (tiempoExpirado) {
        recuperacionesPerfil.delete(clave);

        return res.json({
            ok: false,
            mensaje: "El código expiró. Solicita uno nuevo"
        });
    }

    if (recuperacion.codigo !== codigo) {
        return res.json({
            ok: false,
            mensaje: "El código ingresado es incorrecto"
        });
    }

    bcrypt.hash(nueva_password, 10, (errorHash, passwordHash) => {
        if (errorHash) {
            console.log(errorHash);

            return res.json({
                ok: false,
                mensaje: "Error al proteger la nueva contraseña"
            });
        }

        conexion.query(
            `UPDATE perfiles
             SET password_perfil = ?
             WHERE id = ? AND usuario_id = ?`,
            [passwordHash, perfil_id, usuario_id],
            (error) => {
                if (error) {
                    console.log(error);

                    return res.json({
                        ok: false,
                        mensaje: "No se pudo actualizar la contraseña del perfil"
                    });
                }

                recuperacionesPerfil.delete(clave);

                res.json({
                    ok: true,
                    mensaje: "Contraseña del perfil actualizada correctamente"
                });
            }
        );
    });
});

/* =========================
   MI LISTA
========================= */

app.post("/mi-lista", (req, res) => {
    const { perfil_id, contenido_id } = req.body;

    if (!perfil_id || !contenido_id) {
        return res.json({
            ok: false,
            mensaje: "Datos incompletos para Mi Lista"
        });
    }

    conexion.query(
        "SELECT * FROM mi_lista WHERE perfil_id = ? AND contenido_id = ?",
        [perfil_id, contenido_id],
        (error, resultados) => {
            if (error) {
                console.log(error);

                return res.json({
                    ok: false,
                    mensaje: "Error al verificar Mi Lista"
                });
            }

            if (resultados.length > 0) {
                return res.json({
                    ok: true,
                    mensaje: "Este contenido ya está en Mi Lista"
                });
            }

            conexion.query(
                "INSERT INTO mi_lista(perfil_id, contenido_id) VALUES (?, ?)",
                [perfil_id, contenido_id],
                (errorInsert) => {
                    if (errorInsert) {
                        console.log(errorInsert);

                        return res.json({
                            ok: false,
                            mensaje: "No se pudo agregar a Mi Lista"
                        });
                    }

                    res.json({
                        ok: true,
                        mensaje: "Agregado a Mi Lista"
                    });
                }
            );
        }
    );
});

app.get("/mi-lista/:perfil_id", (req, res) => {
    const perfil_id = req.params.perfil_id;

    conexion.query(
        `SELECT contenido.*
         FROM mi_lista
         INNER JOIN contenido ON mi_lista.contenido_id = contenido.id
         WHERE mi_lista.perfil_id = ? 
         AND COALESCE(contenido.activo, 1) = 1
         ORDER BY mi_lista.id DESC`,
        [perfil_id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            res.json(resultados);
        }
    );
});

app.delete("/mi-lista/:perfil_id/:contenido_id", (req, res) => {
    const { perfil_id, contenido_id } = req.params;

    conexion.query(
        "DELETE FROM mi_lista WHERE perfil_id = ? AND contenido_id = ?",
        [perfil_id, contenido_id],
        (error) => {
            if (error) {
                console.log(error);

                return res.json({
                    ok: false,
                    mensaje: "No se pudo eliminar"
                });
            }

            res.json({
                ok: true,
                mensaje: "Eliminado de Mi Lista"
            });
        }
    );
});

/* =========================
   HISTORIAL / CONTINUAR VIENDO
========================= */

app.post("/historial", (req, res) => {
    const { perfil_id, contenido_id } = req.body;

    if (!perfil_id || !contenido_id) {
        return res.json({
            ok: false,
            mensaje: "Datos incompletos para historial"
        });
    }

    conexion.query(
        "SELECT id FROM historial WHERE perfil_id = ? AND contenido_id = ? AND terminado = 0 LIMIT 1",
        [perfil_id, contenido_id],
        (error, resultados) => {
            if (error) {
                console.log(error);

                return res.json({
                    ok: false,
                    mensaje: "Error al consultar historial"
                });
            }

            if (resultados.length > 0) {
                return res.json({
                    ok: true,
                    mensaje: "Historial ya existe"
                });
            }

            conexion.query(
                `INSERT INTO historial
                 (perfil_id, contenido_id, minuto_actual, porcentaje, terminado)
                 VALUES (?, ?, 0, 0, 0)`,
                [perfil_id, contenido_id],
                (errorInsert) => {
                    if (errorInsert) {
                        console.log(errorInsert);

                        return res.json({
                            ok: false,
                            mensaje: "Error al registrar historial"
                        });
                    }

                    res.json({
                        ok: true,
                        mensaje: "Historial registrado"
                    });
                }
            );
        }
    );
});

app.get("/continuar/:perfil_id", (req, res) => {
    const perfil_id = req.params.perfil_id;

    conexion.query(
        `SELECT 
            contenido.*,
            historial.minuto_actual,
            historial.porcentaje
         FROM historial
         INNER JOIN contenido ON historial.contenido_id = contenido.id
         WHERE historial.perfil_id = ?
         AND historial.terminado = 0
         AND COALESCE(contenido.activo, 1) = 1
         ORDER BY historial.id DESC`,
        [perfil_id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            res.json(resultados);
        }
    );
});

app.put("/historial/visto/:id", (req, res) => {
    const contenido_id = req.params.id;
    const { perfil_id } = req.body;

    let sql = `
        UPDATE historial
        SET terminado = 1, porcentaje = 100
        WHERE contenido_id = ?
    `;

    const parametros = [contenido_id];

    if (perfil_id) {
        sql += " AND perfil_id = ?";
        parametros.push(perfil_id);
    }

    conexion.query(sql, parametros, (error) => {
        if (error) {
            console.log(error);

            return res.json({
                ok: false,
                mensaje: "Error al marcar como visto"
            });
        }

        res.json({
            ok: true,
            mensaje: "Contenido marcado como visto"
        });
    });
});

app.put("/historial/progreso", (req, res) => {
    const { perfil_id, contenido_id, minuto_actual, porcentaje } = req.body;

    if (!perfil_id || !contenido_id) {
        return res.json({
            ok: false,
            mensaje: "Contenido o perfil no válido"
        });
    }

    conexion.query(
        `UPDATE historial
         SET minuto_actual = ?, porcentaje = ?
         WHERE perfil_id = ?
         AND contenido_id = ?
         AND terminado = 0`,
        [
            minuto_actual || 0,
            porcentaje || 0,
            perfil_id,
            contenido_id
        ],
        (error) => {
            if (error) {
                console.log(error);

                return res.json({
                    ok: false,
                    mensaje: "Error al actualizar progreso"
                });
            }

            res.json({
                ok: true,
                mensaje: "Progreso actualizado"
            });
        }
    );
});
/* =========================================
   BUSCAR PELÍCULA EN TMDb (PARA AUTOCOMPLETAR EN ADMIN)
========================================= */
app.get("/tmdb/buscar-preview", async (req, res) => {
    const { titulo } = req.query;

    if (!titulo) {
        return res.json({ ok: false, mensaje: "Falta el título" });
    }

    try {
        const respuesta = await axios.get("https://api.themoviedb.org/3/search/movie", {
            params: {
                api_key: TMDB_API_KEY, // Usa tu clave segura que ya tienes configurada
                query: titulo,
                language: "es-ES"
            }
        });

        if (respuesta.data.results && respuesta.data.results.length > 0) {
            const peli = respuesta.data.results[0]; // Tomamos la primera coincidencia
            
            res.json({
                ok: true,
                titulo: peli.title,
                descripcion: peli.overview || "Sin sinopsis disponible.",
                imagen: peli.poster_path ? `https://image.tmdb.org/t/p/w500${peli.poster_path}` : "",
                genre_ids: peli.genre_ids || []
            });
        } else {
            res.json({ ok: false, mensaje: "No se encontró la película en TMDb" });
        }

    } catch (error) {
        console.log("Error al buscar en TMDb:", error.message);
        res.json({ ok: false, mensaje: "Error al conectar con TMDb" });
    }
});
/* =========================
   TMDb
========================= */

app.get("/tmdb/populares", async (req, res) => {
    try {
        const respuesta = await axios.get(
            "https://api.themoviedb.org/3/movie/popular",
            {
                params: {
                    api_key: TMDB_API_KEY,
                    language: "es-ES",
                    page: 1
                }
            }
        );

        const peliculas = respuesta.data.results.map((pelicula) => ({
            tmdb_id: pelicula.id,
            titulo: pelicula.title,
            descripcion: pelicula.overview,
            imagen: pelicula.poster_path
                ? `https://image.tmdb.org/t/p/w500${pelicula.poster_path}`
                : "",
            fondo: pelicula.backdrop_path
                ? `https://image.tmdb.org/t/p/original${pelicula.backdrop_path}`
                : "",
            fecha_estreno: pelicula.release_date || null,
            calificacion: pelicula.vote_average || 0,
            tipo: "pelicula",
            genero: "TMDb",
            origen: "tmdb"
        }));

        res.json(peliculas);

    } catch (error) {
        console.log("Error al obtener populares de TMDb:", error.message);
        res.json([]);
    }
});

app.get("/tmdb/sincronizar", async (req, res) => {
    try {
        let totalInsertados = 0;
        let totalActualizados = 0;
        let totalErrores = 0;

        const paginas = [1, 2];

        for (const pagina of paginas) {
            const respuesta = await axios.get(
                "https://api.themoviedb.org/3/movie/popular",
                {
                    params: {
                        api_key: TMDB_API_KEY,
                        language: "es-ES",
                        page: pagina
                    }
                }
            );

            const peliculas = respuesta.data.results || [];

            for (const pelicula of peliculas) {
                try {
                    const detalle = await axios.get(
                        `https://api.themoviedb.org/3/movie/${pelicula.id}`,
                        {
                            params: {
                                api_key: TMDB_API_KEY,
                                language: "es-ES"
                            }
                        }
                    );

                    const p = detalle.data;

                    const genero = p.genres && p.genres.length > 0
                        ? p.genres.map(g => g.name).join(", ")
                        : "Sin género";

                    const imagen = p.poster_path
                        ? `https://image.tmdb.org/t/p/w500${p.poster_path}`
                        : "";

                    const fondo = p.backdrop_path
                        ? `https://image.tmdb.org/t/p/original${p.backdrop_path}`
                        : "";

                    const generoMinuscula = genero.toLowerCase();

                    const esInfantil =
                        generoMinuscula.includes("familia") ||
                        generoMinuscula.includes("animación") ||
                        generoMinuscula.includes("animacion");

                    await new Promise((resolve) => {
                        conexion.query(
                            `INSERT INTO contenido
                             (titulo, tipo, genero, descripcion, imagen, fondo, tmdb_id, fecha_estreno, calificacion, origen, infantil)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE
                                titulo = VALUES(titulo),
                                tipo = VALUES(tipo),
                                genero = VALUES(genero),
                                descripcion = VALUES(descripcion),
                                imagen = VALUES(imagen),
                                fondo = VALUES(fondo),
                                fecha_estreno = VALUES(fecha_estreno),
                                calificacion = VALUES(calificacion),
                                origen = VALUES(origen),
                                infantil = VALUES(infantil)`,
                            [
                                p.title,
                                "pelicula",
                                genero,
                                p.overview || "Sin descripción disponible.",
                                imagen,
                                fondo,
                                p.id,
                                p.release_date || null,
                                p.vote_average || 0,
                                "tmdb",
                                esInfantil ? 1 : 0
                            ],
                            (error, resultado) => {
                                if (error) {
                                    console.log("Error al sincronizar película:", error);
                                    totalErrores++;
                                    return resolve();
                                }

                                if (resultado.affectedRows === 1) {
                                    totalInsertados++;
                                } else {
                                    totalActualizados++;
                                }

                                resolve();
                            }
                        );
                    });

                } catch (errorPelicula) {
                    console.log("Error al obtener detalle de película:", errorPelicula.message);
                    totalErrores++;
                }
            }
        }

        res.json({
            ok: true,
            mensaje: "Sincronización con TMDb completada",
            insertados: totalInsertados,
            actualizados: totalActualizados,
            errores: totalErrores
        });

    } catch (error) {
        console.log("Error general al sincronizar TMDb:", error.message);

        res.json({
            ok: false,
            mensaje: "No se pudo sincronizar con TMDb",
            error: error.message
        });
    }
});

app.post("/tmdb/importar", async (req, res) => {
    const { tmdb_id } = req.body;

    if (!tmdb_id) {
        return res.json({
            error: true,
            mensaje: "tmdb_id no válido"
        });
    }

    conexion.query(
        "SELECT * FROM contenido WHERE tmdb_id = ?",
        [tmdb_id],
        async (error, resultados) => {
            if (error) {
                console.log(error);

                return res.json({
                    error: true,
                    mensaje: "Error al buscar contenido en MariaDB"
                });
            }

            if (resultados.length > 0) {
                return res.json(resultados[0]);
            }

            try {
                const respuesta = await axios.get(
                    `https://api.themoviedb.org/3/movie/${tmdb_id}`,
                    {
                        params: {
                            api_key: TMDB_API_KEY,
                            language: "es-ES"
                        }
                    }
                );

                const p = respuesta.data;

                const genero = p.genres
                    ? p.genres.map(g => g.name).join(", ")
                    : "Sin género";

                const imagen = p.poster_path
                    ? `https://image.tmdb.org/t/p/w500${p.poster_path}`
                    : "";

                const fondo = p.backdrop_path
                    ? `https://image.tmdb.org/t/p/original${p.backdrop_path}`
                    : "";

                const generoMinuscula = genero.toLowerCase();

                const esInfantil =
                    generoMinuscula.includes("familia") ||
                    generoMinuscula.includes("animación") ||
                    generoMinuscula.includes("animacion");

                conexion.query(
                    `INSERT INTO contenido
                     (titulo, tipo, genero, descripcion, imagen, fondo, tmdb_id, fecha_estreno, calificacion, origen, infantil)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        p.title,
                        "pelicula",
                        genero,
                        p.overview || "Sin descripción disponible.",
                        imagen,
                        fondo,
                        p.id,
                        p.release_date || null,
                        p.vote_average || 0,
                        "tmdb",
                        esInfantil ? 1 : 0
                    ],
                    (errorInsert, resultado) => {
                        if (errorInsert) {
                            console.log(errorInsert);

                            return res.json({
                                error: true,
                                mensaje: "Error al guardar contenido de TMDb"
                            });
                        }

                        res.json({
                            id: resultado.insertId,
                            titulo: p.title,
                            tipo: "pelicula",
                            genero,
                            descripcion: p.overview || "Sin descripción disponible.",
                            imagen,
                            fondo,
                            tmdb_id: p.id,
                            fecha_estreno: p.release_date || null,
                            calificacion: p.vote_average || 0,
                            origen: "tmdb",
                            infantil: esInfantil ? 1 : 0
                        });
                    }
                );

            } catch (errorApi) {
                console.log("Error al consultar TMDb:", errorApi.message);

                res.json({
                    error: true,
                    mensaje: "No se pudo obtener la película desde TMDb"
                });
            }
        }
    );
});

/* =========================
   PLANES, PAGO, FACTURACIÓN
========================= */

app.get("/planes", (req, res) => {
    conexion.query(
        "SELECT * FROM planes ORDER BY precio ASC",
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            res.json(resultados);
        }
    );
});

/* =========================================
   3. REGISTRO DE PAGO Y ENVÍO DE BOLETA (VÍA GOOGLE SCRIPT)
========================================= */
app.post("/pagos", (req, res) => {
    const { usuario_id, plan_id, metodo_pago, monto } = req.body;

    if (!usuario_id || !plan_id || !metodo_pago || !monto) {
        return res.json({
            ok: false,
            mensaje: "Datos incompletos para procesar el pago"
        });
    }

    const codigo_comprobante = "BOLETA-SV-" + Math.floor(Math.random() * 100000000);

    conexion.query(
        "SELECT nombre, correo FROM usuarios WHERE id = ?",
        [usuario_id],
        (errUsuario, usuarios) => {
            if (errUsuario || usuarios.length === 0) {
                return res.json({
                    ok: false,
                    mensaje: "Usuario no encontrado"
                });
            }

            const usuario = usuarios[0];

            conexion.query(
                "SELECT nombre FROM planes WHERE id = ?",
                [plan_id],
                (errPlan, planes) => {
                    if (errPlan || planes.length === 0) {
                        return res.json({
                            ok: false,
                            mensaje: "Plan no encontrado"
                        });
                    }

                    const planNombre = planes[0].nombre;

                    conexion.query(
                        `INSERT INTO pagos
                         (usuario_id, plan_id, metodo_pago, monto, estado, codigo_comprobante)
                         VALUES (?, ?, ?, ?, 'pagado', ?)`,
                        [usuario_id, plan_id, metodo_pago, monto, codigo_comprobante],
                        (errPago, resultadoPago) => {
                            if (errPago) {
                                console.log(errPago);
                                return res.json({
                                    ok: false,
                                    mensaje: "Error al registrar el pago"
                                });
                            }

                            conexion.query(
                                "UPDATE suscripciones SET estado = 'cancelada' WHERE usuario_id = ? AND estado = 'activa'",
                                [usuario_id],
                                () => {
                                    conexion.query(
                                        `INSERT INTO suscripciones
                                         (usuario_id, plan_id, estado, fecha_inicio, fecha_fin)
                                         VALUES (?, ?, 'activa', NOW(), DATE_ADD(NOW(), INTERVAL 1 MONTH))`,
                                        [usuario_id, plan_id],
                                        async (errSuscripcion) => {
                                            if (errSuscripcion) {
                                                console.log(errSuscripcion);
                                                return res.json({
                                                    ok: false,
                                                    mensaje: "Pago registrado, pero no se pudo activar la suscripción"
                                                });
                                            }

                                            const fechaHoy = new Date().toLocaleDateString("es-PE");

                                            if (process.env.GOOGLE_SCRIPT_URL) {
                                                try {
                                                    await axios.post(process.env.GOOGLE_SCRIPT_URL, {
                                                        tipo: "boleta",
                                                        correo: usuario.correo,
                                                        nombre: usuario.nombre,
                                                        monto: Number(monto).toFixed(2),
                                                        planNombre: planNombre,
                                                        codigo_comprobante: codigo_comprobante,
                                                        metodo_pago: metodo_pago,
                                                        fecha: fechaHoy
                                                    });
                                                } catch (errorCorreo) {
                                                    console.log("Error contactando a Google Script:", errorCorreo.message);
                                                }
                                            }

                                            res.json({
                                                ok: true,
                                                mensaje: "Suscripción activada y boleta enviada.",
                                                pago_id: resultadoPago.insertId,
                                                codigo_comprobante
                                            });
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});
/* =========================================
   1. CÁLCULO DE PRORRATEO Y REGLAS DE NEGOCIO
========================================= */
app.get("/api/pagos/calcular/:usuario_id/:nuevo_plan_id", (req, res) => {
    const { usuario_id, nuevo_plan_id } = req.params;

    conexion.query("SELECT id, precio, nombre FROM planes WHERE id = ?", [nuevo_plan_id], (err1, planes) => {
        if (err1 || planes.length === 0) return res.json({ ok: false, mensaje: "Plan no encontrado" });
        const nuevoPlan = planes[0];

        conexion.query(`
            SELECT s.plan_id, s.fecha_inicio, s.fecha_fin, p.precio as precio_actual, p.nombre as nombre_actual
            FROM suscripciones s
            JOIN planes p ON s.plan_id = p.id
            WHERE s.usuario_id = ? AND s.estado = 'activa'
            ORDER BY s.id DESC LIMIT 1
        `, [usuario_id], (err2, suscripciones) => {
            if (err2) return res.json({ ok: false, mensaje: "Error de servidor" });

            let precio_final = Number(nuevoPlan.precio);
            let descuento = 0;
            let dias_restantes = 0;
            let es_upgrade = false;
            let mensaje_minimo = false;

            // Si el usuario ya tiene una suscripción activa
            if (suscripciones.length > 0) {
                const sub = suscripciones[0];

                // ESCENARIO JURADO 1: Intenta comprar el mismo plan
                if (String(sub.plan_id) === String(nuevo_plan_id)) {
                    return res.json({ ok: false, mensaje: "Ya tienes este plan activo actualmente." });
                }

                // ESCENARIO JURADO 2: Intenta bajar a un plan más barato
                if (Number(nuevoPlan.precio) < Number(sub.precio_actual)) {
                    return res.json({ ok: false, mensaje: "No puedes cambiar a un plan inferior mientras tu suscripción actual siga activa." });
                }

                // ESCENARIO 3: Sube de plan correctamente (Upgrade)
                const hoy = new Date();
                const fechaFin = new Date(sub.fecha_fin);
                const diferenciaMilisegundos = fechaFin - hoy;
                dias_restantes = Math.ceil(diferenciaMilisegundos / (1000 * 60 * 60 * 24));

                if (dias_restantes > 0) {
                    es_upgrade = true;
                    const precioPorDia = Number(sub.precio_actual) / 30;
                    descuento = precioPorDia * dias_restantes;
                    precio_final = precio_final - descuento;

                    // ESCENARIO JURADO 3: El mínimo de Mercado Pago
                    if (precio_final < 3.00) {
                        precio_final = 3.00;
                        mensaje_minimo = true; // Avisamos al frontend para que muestre la advertencia
                    }
                }
            }

            res.json({
                ok: true,
                plan_nombre: nuevoPlan.nombre,
                precio_original: Number(nuevoPlan.precio).toFixed(2),
                descuento: descuento.toFixed(2),
                total_pagar: precio_final.toFixed(2),
                dias_restantes: dias_restantes,
                es_upgrade: es_upgrade,
                mensaje_minimo: mensaje_minimo
            });
        });
    });
});
/* =========================================
   2. CREAR PREFERENCIA MERCADO PAGO CON DESCUENTO APLICADO
========================================= */
app.post("/mercadopago/crear-preferencia", (req, res) => {
    const { usuario_id, plan_id, monto_calculado } = req.body;

    if (!usuario_id || !plan_id) return res.json({ ok: false, mensaje: "Faltan datos" });

    conexion.query("SELECT * FROM planes WHERE id = ?", [plan_id], async (err, resultados) => {
        if (err || resultados.length === 0) return res.json({ ok: false, mensaje: "Plan no encontrado" });

        const plan = resultados[0];
        const precioCobrar = monto_calculado ? Number(monto_calculado) : Number(plan.precio);

        try {
            const body = {
                items: [
                    {
                        id: String(plan.id),
                        title: `Suscripción StarView - Plan ${plan.nombre}`,
                        quantity: 1,
                        unit_price: precioCobrar, 
                        currency_id: "PEN"
                    }
                ],
                back_urls: {
                    success: `${process.env.BASE_URL}/pago-exitoso.html?usuario_id=${usuario_id}&plan_id=${plan.id}&monto=${precioCobrar}`,
                    failure: `${process.env.BASE_URL}/pago-fallido.html`,
                    pending: `${process.env.BASE_URL}/pago-pendiente.html`
                },
                auto_return: "approved"
            };

            const preference = new Preference(clienteMP);
            const respuesta = await preference.create({ body });

            res.json({ ok: true, init_point: respuesta.init_point, sandbox_init_point: respuesta.sandbox_init_point });
        } catch (error) {
            console.error("Error al crear preferencia:", error);
            res.json({ ok: false, mensaje: "Error al generar enlace de pago" });
        }
    });
});
app.get("/facturacion/:usuario_id", (req, res) => {
    const usuario_id = req.params.usuario_id;

    conexion.query(
        `SELECT p.*, pl.nombre AS plan_nombre
         FROM pagos p
         INNER JOIN planes pl ON p.plan_id = pl.id
         WHERE p.usuario_id = ?
         ORDER BY p.fecha_pago DESC`,
        [usuario_id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            res.json(resultados);
        }
    );
});

app.get("/recibo/:id", (req, res) => {
    const id = req.params.id;

    conexion.query(
        `SELECT
            pagos.id,
            pagos.monto,
            pagos.metodo_pago,
            pagos.estado,
            pagos.fecha_pago,
            planes.nombre AS plan,
            usuarios.nombre AS usuario,
            usuarios.correo
         FROM pagos
         INNER JOIN planes ON pagos.plan_id = planes.id
         INNER JOIN usuarios ON pagos.usuario_id = usuarios.id
         WHERE pagos.id = ?`,
        [id],
        (error, resultados) => {
            if (error || resultados.length === 0) {
                return res.send("Recibo no encontrado");
            }

            const pago = resultados[0];

            res.send(`
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <title>Recibo StarView</title>
                    <style>
                        body{
                            margin:0;
                            min-height:100vh;
                            font-family: Arial, sans-serif;
                            background:#090b13;
                            color:#f5f5f5;
                            display:flex;
                            align-items:center;
                            justify-content:center;
                            padding:40px;
                        }
                        .recibo{
                            width:100%;
                            max-width:680px;
                            background:linear-gradient(145deg,#111827,#0f1016);
                            border:1px solid rgba(255,255,255,.12);
                            border-radius:22px;
                            padding:34px;
                            box-shadow:0 25px 80px rgba(0,0,0,.45);
                        }
                        h1{
                            color:#e50914;
                            margin:0;
                            letter-spacing:2px;
                        }
                        h2{
                            margin-top:8px;
                            color:#fff;
                        }
                        .fila{
                            padding:12px 0;
                            border-bottom:1px solid rgba(255,255,255,.08);
                        }
                        button{
                            margin-top:24px;
                            padding:13px 22px;
                            background:#e50914;
                            color:white;
                            border:none;
                            border-radius:999px;
                            cursor:pointer;
                            font-weight:bold;
                        }
                    </style>
                </head>
                <body>
                    <div class="recibo">
                        <h1>STARVIEW</h1>
                        <h2>Recibo de pago</h2>

                        <div class="fila"><strong>N° Recibo:</strong> ${pago.id}</div>
                        <div class="fila"><strong>Usuario:</strong> ${pago.usuario}</div>
                        <div class="fila"><strong>Correo:</strong> ${pago.correo}</div>
                        <div class="fila"><strong>Plan:</strong> ${pago.plan}</div>
                        <div class="fila"><strong>Monto:</strong> S/ ${pago.monto}</div>
                        <div class="fila"><strong>Método:</strong> ${pago.metodo_pago}</div>
                        <div class="fila"><strong>Estado:</strong> ${pago.estado}</div>
                        <div class="fila"><strong>Fecha:</strong> ${new Date(pago.fecha_pago).toLocaleString()}</div>

                        <button onclick="window.print()">Descargar / imprimir PDF</button>
                    </div>
                </body>
                </html>
            `);
        }
    );
});

app.get("/suscripcion/:usuario_id", (req, res) => {
    const usuario_id = req.params.usuario_id;

    conexion.query(
        `SELECT
            suscripciones.id,
            suscripciones.estado,
            suscripciones.fecha_inicio,
            suscripciones.fecha_cancelacion,
            suscripciones.renovacion_automatica,
            suscripciones.motivo_cancelacion,
            suscripciones.fecha_fin,
            planes.nombre AS plan,
            planes.precio
         FROM suscripciones
         INNER JOIN planes ON suscripciones.plan_id = planes.id
         WHERE suscripciones.usuario_id = ?
         ORDER BY suscripciones.id DESC
         LIMIT 1`,
        [usuario_id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({});
            }

            if (resultados.length === 0) {
                return res.json({});
            }

            res.json(resultados[0]);
        }
    );
});

app.put("/suscripcion/cancelar/:id", (req, res) => {
    const id = req.params.id;
    const { motivo_cancelacion } = req.body;

    if (!motivo_cancelacion) {
        return res.json({
            ok: false,
            mensaje: "Debe ingresar un motivo de cancelación"
        });
    }

    // SOLUCIÓN: Solo actualizamos el estado y el motivo. Ya NO tocamos la fecha_fin.
    conexion.query(
        `UPDATE suscripciones
         SET estado = 'cancelada',
             renovacion_automatica = 0,
             motivo_cancelacion = ?,
             fecha_cancelacion = NOW()
         WHERE id = ?`,
        [motivo_cancelacion, id],
        (error) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "No se pudo cancelar la suscripción"
                });
            }

            res.json({
                ok: true,
                mensaje: "Suscripción cancelada. Mantendrás acceso hasta el fin de tus 30 días."
            });
        }
    );
});
/* =========================================
   SISTEMA DE RECOMENDACIONES LOCALES MULTI-GÉNERO
========================================= */

app.get("/api/recomendaciones/:genero/:id_actual", (req, res) => {
    const { genero, id_actual } = req.params;
    const perfil_id = req.query.perfil_id;

    const generosArray = decodeURIComponent(genero || "")
        .split(",")
        .map(g => g.trim())
        .filter(g => g.length > 0);

    const regexPattern = generosArray.length > 0
        ? generosArray.join("|")
        : ".*";

    function buscarRecomendaciones(esInfantil) {
        let sql = `
            SELECT *
            FROM contenido
            WHERE id != ?
        `;

        const parametros = [id_actual];

        if (esInfantil) {
            sql += " AND infantil = 1";
        }

        sql += " AND genero REGEXP ?";
        parametros.push(regexPattern);

        sql += " ORDER BY id DESC LIMIT 6";

        conexion.query(sql, parametros, (error, resultados) => {
            if (error) {
                console.log("Error buscando recomendaciones:", error);
                return res.json([]);
            }

            if (esInfantil && resultados.length === 0) {
                conexion.query(
                    `SELECT *
                     FROM contenido
                     WHERE id != ?
                     AND infantil = 1
                     ORDER BY id DESC
                     LIMIT 6`,
                    [id_actual],
                    (errorFallback, resultadosFallback) => {
                        if (errorFallback) {
                            console.log("Error buscando recomendaciones infantiles:", errorFallback);
                            return res.json([]);
                        }

                        return res.json(resultadosFallback);
                    }
                );

                return;
            }

            res.json(resultados);
        });
    }

    if (!perfil_id) {
        return buscarRecomendaciones(false);
    }

    conexion.query(
        "SELECT infantil FROM perfiles WHERE id = ?",
        [perfil_id],
        (error, perfiles) => {
            if (error) {
                console.log("Error al verificar perfil para recomendaciones:", error);
                return res.json([]);
            }

            const esInfantil = perfiles.length > 0 && Number(perfiles[0].infantil) === 1;

            buscarRecomendaciones(esInfantil);
        }
    );
});

/* =========================================
   RUTAS PARA CASOS DE PRUEBA HU03 Y HU15
========================================= */

app.put("/perfiles/:id", (req, res) => {
    const { id } = req.params;
    const { nombre, avatar, infantil } = req.body;

    conexion.query(
        "UPDATE perfiles SET nombre = ?, avatar = ?, infantil = ? WHERE id = ?",
        [nombre, avatar, infantil ? 1 : 0, id],
        (error) => {
            if (error) {
                return res.json({
                    ok: false,
                    mensaje: "Error al actualizar perfil"
                });
            }

            res.json({
                ok: true,
                mensaje: "Perfil actualizado correctamente"
            });
        }
    );
});

app.delete("/perfiles/:id", (req, res) => {
    const { id } = req.params;

    conexion.query("DELETE FROM historial WHERE perfil_id = ?", [id], () => {
        conexion.query("DELETE FROM mi_lista WHERE perfil_id = ?", [id], () => {
            conexion.query("DELETE FROM perfiles WHERE id = ?", [id], (error) => {
                if (error) {
                    return res.json({
                        ok: false,
                        mensaje: "Error al eliminar perfil"
                    });
                }

                res.json({
                    ok: true,
                    mensaje: "Perfil eliminado correctamente"
                });
            });
        });
    });
});

app.get("/recomendaciones/historial/:perfil_id", (req, res) => {
    const { perfil_id } = req.params;

    conexion.query(
        `SELECT infantil FROM perfiles WHERE id = ?`,
        [perfil_id],
        (errorPerfil, perfiles) => {
            if (errorPerfil) {
                console.log(errorPerfil);
                return res.json({
                    ok: false,
                    mensaje: "Error al verificar perfil"
                });
            }

            const esInfantil = perfiles.length > 0 && Number(perfiles[0].infantil) === 1;

            // 1. Aquí agregamos el filtro para que el género favorito no se base en películas ocultas
            conexion.query(
                `SELECT c.genero, COUNT(*) AS vistas
                 FROM historial h
                 INNER JOIN contenido c ON h.contenido_id = c.id
                 WHERE h.perfil_id = ? AND COALESCE(c.activo, 1) = 1
                 GROUP BY c.genero
                 ORDER BY vistas DESC
                 LIMIT 1`,
                [perfil_id],
                (error, resultados) => {
                    if (error || resultados.length === 0) {
                        return res.json({
                            ok: false,
                            mensaje: "No hay historial suficiente"
                        });
                    }

                    const generoFavorito = resultados[0].genero.split(",")[0].trim();

                    // 2. Aquí agregamos el filtro para NUNCA recomendar películas ocultas
                    let sql = `
                        SELECT c.*
                        FROM contenido c
                        WHERE c.genero LIKE ?
                        AND COALESCE(c.activo, 1) = 1
                        AND c.id NOT IN (
                            SELECT contenido_id
                            FROM historial
                            WHERE perfil_id = ?
                            AND terminado = 1
                        )
                    `;

                    const parametros = [`%${generoFavorito}%`, perfil_id];

                    if (esInfantil) {
                        sql += " AND c.infantil = 1";
                    }

                    sql += " LIMIT 12";

                    conexion.query(sql, parametros, (errorRecomendaciones, peliculas) => {
                        if (errorRecomendaciones) {
                            return res.json({
                                ok: false
                            });
                        }

                        res.json({
                            ok: true,
                            genero: generoFavorito,
                            recomendaciones: peliculas
                        });
                    });
                }
            );
        }
    );
});
/* =========================================
   CONTROL DE PANTALLAS SIMULTÁNEAS Y CALIDAD
========================================= */

app.post("/api/stream/iniciar", (req, res) => {
    const { usuario_id, dispositivo_token } = req.body;

    if (!usuario_id || !dispositivo_token) {
        return res.json({
            ok: false,
            mensaje: "Faltan datos de sesión."
        });
    }

    conexion.query(
        "DELETE FROM reproducciones_activas WHERE ultima_actividad < DATE_SUB(NOW(), INTERVAL 25 SECOND)",
        (errLimpieza) => {
            if (errLimpieza) {
                console.error("Error limpiando sesiones:", errLimpieza);
            }

            conexion.query(
                `SELECT s.estado, s.fecha_fin, p.pantallas, p.calidad
                 FROM suscripciones s
                 INNER JOIN planes p ON s.plan_id = p.id
                 WHERE s.usuario_id = ?
                 AND (s.estado = 'activa' OR (s.estado = 'cancelada' AND s.fecha_fin >= NOW()))
                 ORDER BY s.id DESC
                 LIMIT 1`,
                [usuario_id],
                (errorSuscripcion, suscripcion) => {
                    if (errorSuscripcion || suscripcion.length === 0) {
                        return res.json({
                            ok: false,
                            mensaje: "No tienes una suscripción activa."
                        });
                    }

                    const limites = suscripcion[0];
                    const maxPantallas = parseInt(limites.pantallas) || 1;

                    conexion.query(
                        "SELECT dispositivo_token FROM reproducciones_activas WHERE usuario_id = ?",
                        [usuario_id],
                        (errorContador, activas) => {
                            if (errorContador) {
                                return res.json({
                                    ok: false,
                                    mensaje: "Error de servidor."
                                });
                            }

                            const yaEstaReproduciendo = activas.some(
                                item => item.dispositivo_token === dispositivo_token
                            );

                            if (activas.length >= maxPantallas && !yaEstaReproduciendo) {
                                return res.json({
                                    ok: false,
                                    limiteExcedido: true,
                                    mensaje: `Tu plan actual solo permite ${maxPantallas} pantalla(s) en simultáneo. Cierra otra ventana.`
                                });
                            }

                            conexion.query(
                                `INSERT INTO reproducciones_activas
                                 (usuario_id, dispositivo_token, ultima_actividad)
                                 VALUES (?, ?, NOW())
                                 ON DUPLICATE KEY UPDATE ultima_actividad = NOW()`,
                                [usuario_id, dispositivo_token],
                                (errInsert) => {
                                    if (errInsert) {
                                        return res.json({
                                            ok: false,
                                            mensaje: "Error al registrar pantalla."
                                        });
                                    }

                                    res.json({
                                        ok: true,
                                        calidad_maxima: limites.calidad,
                                        mensaje: "Streaming autorizado."
                                    });
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

app.post("/api/stream/ping", (req, res) => {
    const { usuario_id, dispositivo_token } = req.body;

    conexion.query(
        "UPDATE reproducciones_activas SET ultima_actividad = NOW() WHERE usuario_id = ? AND dispositivo_token = ?",
        [usuario_id, dispositivo_token],
        () => {
            res.json({
                ok: true
            });
        }
    );
});

app.post("/api/stream/cerrar", (req, res) => {
    const { usuario_id, dispositivo_token } = req.body;

    conexion.query(
        "DELETE FROM reproducciones_activas WHERE usuario_id = ? AND dispositivo_token = ?",
        [usuario_id, dispositivo_token],
        () => {
            res.json({
                ok: true,
                mensaje: "Pantalla liberada."
            });
        }
    );
});

/* =========================================
   REPRESENTACIÓN IMPRESA DE BOLETA (CLON SUNAT EXACTO)
========================================= */
app.get("/api/pagos/recibo/:id", (req, res) => {
    const pagoId = req.params.id;

    const queryBoleta = `
        SELECT 
            p.codigo_comprobante,
            p.monto,
            p.metodo_pago,
            DATE_FORMAT(p.fecha_pago, '%d/%m/%Y') AS fecha,
            p.plan_id,
            u.nombre
        FROM pagos p
        JOIN usuarios u ON p.usuario_id = u.id
        WHERE p.id = ?
    `;

    conexion.query(queryBoleta, [pagoId], (err, resultados) => {
        if (err) {
            console.error("Error SQL en Recibo:", err);
            return res.status(500).send(`Error de Base de Datos: ${err.message}`);
        }

        if (resultados.length === 0) {
            return res.status(404).send("<h1>Error: El ID de pago no existe en la base de datos</h1>");
        }

        const pago = resultados[0];

        // Traducimos el plan_id a texto
        let planNombre = "Básico";
        if (Number(pago.plan_id) === 2) planNombre = "Estándar";
        if (Number(pago.plan_id) === 3) planNombre = "Premium";

        // --- CÁLCULOS TRIBUTARIOS SUNAT (IGV 18%) ---
        const totalNum = parseFloat(pago.monto) || 0;
        const subtotalNum = totalNum / 1.18;
        const igvNum = totalNum - subtotalNum;

        const subtotalStr = subtotalNum.toFixed(2);
        const igvStr = igvNum.toFixed(2);
        const totalStr = totalNum.toFixed(2);

        // --- SERIE DE BOLETA ELECTRÓNICA ---
        const numerosComprobante = String(pago.codigo_comprobante).replace(/[^0-9]/g, '');
        const correlativo = numerosComprobante.padStart(8, '0').slice(-8); 
        const serieBoleta = `EB01-${correlativo}`; // Usando EB01 como en tu imagen

        // --- CONVERSOR DE NÚMEROS A LETRAS (OBLIGATORIO EN SUNAT) ---
        function numeroALetras(num) {
            const unidades = ["CERO", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE"];
            const decenas = ["", "", "VEINTI", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
            if (num <= 20) return unidades[num];
            if (num < 30) return "VEINTI" + unidades[num-20];
            let d = Math.floor(num/10);
            let u = num % 10;
            return decenas[d] + (u > 0 ? " Y " + unidades[u] : "");
        }
        
        const entero = Math.floor(totalNum);
        const decimales = Math.round((totalNum - entero) * 100).toString().padStart(2, '0');
        const textoMonto = `SON: ${numeroALetras(entero)} Y ${decimales}/100 SOLES`;

        // Generamos el HTML imitando el PDF clásico de los ERP peruanos
        res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Boleta Electrónica ${serieBoleta}</title>
            <style>
                body {
                    font-family: Arial, Helvetica, sans-serif;
                    font-size: 11px;
                    color: #000;
                    margin: 0;
                    padding: 20px;
                    display: flex;
                    justify-content: center;
                    background-color: #525659; /* Fondo oscuro típico de visores PDF */
                }
                .pdf-container {
                    background-color: #fff;
                    width: 210mm; /* Ancho A4 */
                    min-height: 297mm; /* Alto A4 */
                    padding: 40px;
                    box-sizing: border-box;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.5);
                }
                .main-border {
                    border: 1px solid #000;
                    padding: 2px;
                }
                .header-container {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 15px;
                }
                .company-info {
                    width: 60%;
                }
                .company-name {
                    font-weight: bold;
                    font-size: 14px;
                    margin-bottom: 5px;
                }
                .ruc-box {
                    border: 2px solid #000;
                    width: 35%;
                    text-align: center;
                    padding: 10px;
                    font-weight: bold;
                    font-size: 14px;
                }
                .ruc-box div { margin: 5px 0; }
                
                .customer-info {
                    display: grid;
                    grid-template-columns: 130px 10px auto;
                    row-gap: 4px;
                    margin-bottom: 15px;
                    border-bottom: 1px solid #000;
                    padding-bottom: 10px;
                }
                .customer-info div:nth-child(3n+2) { text-align: center; }
                
                .items-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 5px;
                }
                .items-table th {
                    border-top: 2px solid #000;
                    border-bottom: 1px solid #000;
                    padding: 5px;
                    text-align: left;
                }
                .items-table td {
                    padding: 8px 5px;
                    vertical-align: top;
                }
                .items-table th.right, .items-table td.right { text-align: right; }
                .items-table th.center, .items-table td.center { text-align: center; }
                
                .sub-totals {
                    width: 100%;
                    display: flex;
                    justify-content: flex-end;
                    border-bottom: 1px solid #000;
                    padding-bottom: 5px;
                    margin-bottom: 5px;
                }
                .sub-totals-grid {
                    display: grid;
                    grid-template-columns: 150px 10px 80px;
                    row-gap: 3px;
                    text-align: right;
                }
                .sub-totals-grid div:nth-child(3n+1) { text-align: right; }
                
                .footer-container {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 10px;
                }
                .footer-notes {
                    width: 50%;
                }
                .tax-grid {
                    width: 45%;
                    display: grid;
                    grid-template-columns: auto 10px 80px;
                    row-gap: 3px;
                }
                .tax-grid div:nth-child(3n+1) { text-align: right; }
                .tax-grid div:nth-child(3n+3) { text-align: right; }
                .tax-grid .total-row { font-weight: bold; font-size: 13px; }
                .tax-box { border: 1px solid #000; padding: 1px 4px; }
                
                .legal-footer {
                    border: 1px solid #000;
                    text-align: center;
                    padding: 10px;
                    font-style: italic;
                    font-size: 10px;
                    margin-top: 10px;
                }
                .legal-footer a { color: #000; text-decoration: underline; }
                
                .no-print { text-align: right; margin-bottom: 10px; }
                .btn-print { background: #000; color: #fff; padding: 8px 15px; border: none; cursor: pointer; font-weight: bold; }
                
                @media print {
                    body { background-color: #fff; padding: 0; }
                    .pdf-container { box-shadow: none; width: 100%; padding: 0; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="pdf-container">
                <div class="no-print">
                    <button class="btn-print" onclick="window.print()">Imprimir Comprobante</button>
                </div>
                
                <div class="main-border">
                    <div class="header-container">
                        <div class="company-info">
                            <div class="company-name">STARVIEW S.A.C.</div>
                            <div>AV. AMÉRICA SUR 3145 URB. EL BOSQUE</div>
                            <div>TRUJILLO - TRUJILLO - LA LIBERTAD</div>
                        </div>
                        <div class="ruc-box">
                            <div>BOLETA DE VENTA ELECTRONICA</div>
                            <div>RUC: 20123456789</div>
                            <div>${serieBoleta}</div>
                        </div>
                    </div>

                    <div class="customer-info">
                        <div>Fecha de Emisión</div><div>:</div><div>${pago.fecha}</div>
                        <div>Señor(es)</div><div>:</div><div>${pago.nombre.toUpperCase()}</div>
                        <div>DNI / DOC</div><div>:</div><div>00000000</div>
                        <div>Tipo de Moneda</div><div>:</div><div>SOLES</div>
                        <div>Observación</div><div>:</div><div>PAGO: ${(pago.metodo_pago || 'MERCADOPAGO').toUpperCase()}</div>
                    </div>

                    <table class="items-table">
                        <thead>
                            <tr>
                                <th class="center" style="width: 10%;">Cantidad</th>
                                <th class="center" style="width: 15%;">Unidad Medida</th>
                                <th style="width: 35%;">Descripción</th>
                                <th class="right" style="width: 15%;">Valor Unitario(*)</th>
                                <th class="right" style="width: 10%;">Descuento(*)</th>
                                <th class="right" style="width: 15%;">Importe de Venta(**)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="center">1.00</td>
                                <td class="center">UNIDAD</td>
                                <td>SUSCRIPCION STARVIEW - PLAN ${planNombre.toUpperCase()}</td>
                                <td class="right">${subtotalStr}</td>
                                <td class="right">0.00</td>
                                <td class="right">${subtotalStr}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="sub-totals">
                        <div class="sub-totals-grid">
                            <div>Otros Cargos</div><div>:</div><div>S/ 0.00</div>
                            <div>Otros Tributos</div><div>:</div><div>S/ 0.00</div>
                            <div>ICBPER</div><div>:</div><div class="tax-box">S/ 0.00</div>
                            <div>Importe Total</div><div>:</div><div>S/ ${subtotalStr}</div>
                        </div>
                    </div>

                    <div style="font-weight: bold; margin-bottom: 15px; text-align: right;">
                        ${textoMonto}
                    </div>

                    <div class="footer-container">
                        <div class="footer-notes">
                            <div>(*) Sin impuestos.</div>
                            <div>(**) Incluye impuestos, de ser Op. Gravada.</div>
                        </div>
                        
                        <div class="tax-grid">
                            <div>Op. Gravada</div><div>:</div><div class="tax-box">S/ ${subtotalStr}</div>
                            <div>Op. Exonerada</div><div>:</div><div class="tax-box">S/ 0.00</div>
                            <div>Op. Inafecta</div><div>:</div><div class="tax-box">S/ 0.00</div>
                            <div>ISC</div><div>:</div><div class="tax-box">S/ 0.00</div>
                            <div>IGV</div><div>:</div><div class="tax-box">S/ ${igvStr}</div>
                            <div>ICBPER</div><div>:</div><div class="tax-box">S/ 0.00</div>
                            <div>Otros Cargos</div><div>:</div><div class="tax-box">S/ 0.00</div>
                            <div>Otros Tributos</div><div>:</div><div class="tax-box">S/ 0.00</div>
                            <div>Monto de Redondeo</div><div>:</div><div class="tax-box">S/ 0.00</div>
                            <div class="total-row">Importe Total</div><div class="total-row">:</div><div class="tax-box total-row">S/ ${totalStr}</div>
                        </div>
                    </div>

                    <div class="legal-footer">
                        Esta es una representación impresa de la Boleta de Venta Electrónica, generada en el Sistema de la SUNAT. El Emisor Electrónico puede verificarla utilizando su clave SOL, el Adquirente o Usuario puede consultar su validez en SUNAT Virtual: <a href="http://www.sunat.gob.pe" target="_blank">www.sunat.gob.pe</a>, en Opciones sin Clave SOL/ Consulta de Validez del CPE.
                    </div>
                </div>
            </div>
        </body>
        </html>
        `);
    });
});
/* =========================================
   CANCELAR SUSCRIPCIÓN
========================================= */
app.post("/api/suscripciones/cancelar", (req, res) => {
    const { usuario_id, motivo } = req.body;

    conexion.query(
        "SELECT fecha_fin FROM suscripciones WHERE usuario_id = ? AND estado = 'activa' ORDER BY id DESC LIMIT 1",
        [usuario_id],
        (err, resultados) => {
            if (err || resultados.length === 0) {
                return res.json({
                    ok: false,
                    mensaje: "No tienes un plan activo para cancelar."
                });
            }

            const fechaFin = new Date(resultados[0].fecha_fin).toLocaleDateString("es-PE");

            const queryUpdate = `
                UPDATE suscripciones
                SET renovacion_automatica = 0,
                    fecha_cancelacion = NOW(),
                    motivo_cancelacion = ?
                WHERE usuario_id = ?
                AND estado = 'activa'
            `;

            conexion.query(queryUpdate, [motivo || "Decisión del usuario", usuario_id], (errUpdate) => {
                if (errUpdate) {
                    return res.json({
                        ok: false,
                        mensaje: "Error interno al cancelar."
                    });
                }

                res.json({
                    ok: true,
                    mensaje: `Tu plan ha sido cancelado. No se te harán más cobros, pero podrás seguir disfrutando del contenido hasta el ${fechaFin}.`
                });
            });
        }
    );
});
/* =========================================
   ELIMINAR PELÍCULA DEFINITIVAMENTE (HARD DELETE)
========================================= */
app.delete("/api/admin/contenido/:id", (req, res) => {
    const id = req.params.id;

    // 1. Borramos los registros huérfanos en "Mi Lista"
    conexion.query("DELETE FROM mi_lista WHERE contenido_id = ?", [id], (errLista) => {
        if (errLista) console.error("Error al limpiar Mi Lista:", errLista);

        // 2. Borramos los registros huérfanos en el "Historial"
        conexion.query("DELETE FROM historial WHERE contenido_id = ?", [id], (errHistorial) => {
            if (errHistorial) console.error("Error al limpiar Historial:", errHistorial);

            // 3. Finalmente, con las llaves foráneas libres, borramos la película real
            conexion.query("DELETE FROM contenido WHERE id = ?", [id], (errContenido) => {
                if (errContenido) {
                    console.error("Error al eliminar la película de la BD:", errContenido);
                    return res.json({ ok: false, mensaje: "Error en la base de datos al eliminar." });
                }
                
                res.json({ ok: true, mensaje: "Película eliminada definitivamente." });
            });
        });
    });
});
/* =========================================
   PANEL DE ADMINISTRACIÓN (CRM + CMS COMPLETO)
========================================= */
app.get("/panel-admin/:usuario_id", (req, res) => {
    const { usuario_id } = req.params;

    conexion.query("SELECT correo FROM usuarios WHERE id = ?", [usuario_id], (errAdmin, usuarios) => {
        if (errAdmin || usuarios.length === 0) return res.send("<h1>Usuario no encontrado</h1>");

        const CORREO_ADMINISTRADOR = "soporte.starview@gmail.com"; 

        if (usuarios[0].correo !== CORREO_ADMINISTRADOR) {
            return res.redirect("/seleccionar-perfil.html"); 
        }

        const queryStats = `SELECT 
            (SELECT COUNT(*) FROM usuarios WHERE correo != ?) AS total_usuarios,
            (SELECT SUM(monto) FROM pagos WHERE estado = 'pagado') AS ingresos,
            (SELECT COUNT(*) FROM suscripciones WHERE estado = 'activa') AS activas`;

        const queryCRM = `SELECT u.id, u.nombre, u.correo, DATE_FORMAT(u.fecha_registro, '%d/%m/%Y') as fecha_registro,
               COALESCE((SELECT s.estado FROM suscripciones s WHERE s.usuario_id = u.id ORDER BY s.id DESC LIMIT 1), 'Sin suscripción') AS estado_suscripcion
        FROM usuarios u WHERE u.correo != ? ORDER BY u.id DESC`;

        // MODIFICACIÓN: Extraemos video_url, imagen y activo
        const queryCMS = `SELECT id, titulo, genero, descripcion, infantil, origen, video_url, imagen, COALESCE(activo, 1) as activo FROM contenido ORDER BY id DESC LIMIT 500`;

        conexion.query(queryStats, [CORREO_ADMINISTRADOR], (errStats, resStats) => {
            conexion.query(queryCRM, [CORREO_ADMINISTRADOR], (errCRM, resCRM) => {
                conexion.query(queryCMS, (errCMS, resCMS) => {
                    
                    const stats = resStats[0] || {};
                    const clientes = resCRM || [];
                    const catalogo = resCMS || [];

                    const filasCRM = clientes.map(u => {
                        let claseBadge = "sin-suscripcion";
                        if (u.estado_suscripcion === "activa") claseBadge = "activa";
                        if (u.estado_suscripcion === "cancelada") claseBadge = "cancelada";
                        return `<tr><td>#${u.id}</td><td style="font-weight: bold;">${u.nombre}</td><td style="color: #94a3b8;">${u.correo}</td><td>${u.fecha_registro}</td><td><span class="badge ${claseBadge}">${u.estado_suscripcion}</span></td></tr>`;
                    }).join("");

                    const filasCMS = catalogo.map(c => {
                        const peliDatos = JSON.stringify(c).replace(/"/g, '&quot;');
                        
                        // Si está inactiva, la pintamos de rojo/gris para que el admin lo note
                        const visibilidad = c.activo === 0 
                            ? `<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444;">OCULTA</span>` 
                            : `<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981;">PÚBLICA</span>`;

                        const opacidad = c.activo === 0 ? "opacity: 0.5;" : "";

                        return `<tr class="fila-peli" style="${opacidad}">
                            <td>#${c.id}</td>
                            <td class="titulo-peli" style="font-weight: bold;">${c.titulo}</td>
                            <td style="color: #94a3b8;">${c.genero}</td>
                            <td>${visibilidad}</td>
                            <td style="min-width: 180px;">
                                <button onclick="abrirModalEditar(${peliDatos})" style="background: #3b82f6; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; margin-right: 5px;">✏️ Editar</button>
                                <button onclick="eliminarPelicula(${c.id})" style="background: #e50914; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">🗑️ Eliminar</button>
                            </td>
                        </tr>`;
                    }).join("");

                    const html = `
                    <!DOCTYPE html>
                    <html lang="es">
                    <head>
                        <meta charset="UTF-8">
                        <title>Admin - StarView</title>
                        <style>
                            body { margin: 0; padding: 0; font-family: 'Arial', sans-serif; background-color: #0b0f19; color: #ffffff; }
                            .admin-header { background-color: #151a23; padding: 20px 40px; border-bottom: 1px solid #1f2937; display: flex; justify-content: space-between; align-items: center; }
                            .admin-header h1 { color: #e50914; margin: 0; font-size: 24px; letter-spacing: 2px; }
                            .container { padding: 40px; max-width: 1200px; margin: 0 auto; }
                            .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 40px; }
                            .stat-card { background: linear-gradient(145deg, #1f2937, #151a23); border: 1px solid rgba(255,255,255,0.05); padding: 30px; border-radius: 12px; }
                            .stat-card h3 { margin: 0 0 10px 0; color: #94a3b8; font-size: 16px; text-transform: uppercase; }
                            .stat-card .value { font-size: 40px; font-weight: bold; margin: 0; color: #ffffff; }
                            .stat-card.ingresos .value { color: #4ade80; }
                            .btn-volver { background: transparent; color: #cbd5e1; border: 1px solid #cbd5e1; padding: 8px 16px; border-radius: 6px; cursor: pointer; text-decoration: none; }
                            .btn-volver:hover { background: rgba(255,255,255,0.1); }
                            .crm-table-container { background: #151a23; border-radius: 12px; border: 1px solid #1f2937; overflow: hidden; margin-bottom: 40px;}
                            table { width: 100%; border-collapse: collapse; text-align: left; }
                            th, td { padding: 15px 20px; border-bottom: 1px solid #1f2937; }
                            th { background-color: #0b0f19; color: #94a3b8; font-size: 14px; text-transform: uppercase; }
                            .badge { padding: 5px 10px; border-radius: 999px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
                            .input-admin { width: 100%; padding: 10px; margin-bottom: 15px; background: #1f2937; color: white; border: 1px solid #374151; border-radius: 6px; box-sizing: border-box; }
                        </style>
                    </head>
                    <body>
                        <header class="admin-header">
                            <h1>STARVIEW <span style="color: #fff; font-size: 18px;">ADMIN</span></h1>
                            <button onclick="cerrarSesionAdmin()" class="btn-volver">🚪 Cerrar Sesión</button>
                        </header>
                        <div class="container">
                            <h2 style="margin-bottom: 30px;">Resumen del Negocio</h2>
                            <div class="stats-grid">
                                <div class="stat-card"><h3>👥 Clientes</h3><p class="value">${stats.total_usuarios}</p></div>
                                <div class="stat-card"><h3>⭐ Subs. Activas</h3><p class="value">${stats.activas}</p></div>
                                <div class="stat-card ingresos"><h3>💰 Ingresos Totales</h3><p class="value">S/ ${Number(stats.ingresos || 0).toFixed(2)}</p></div>
                            </div>
                            
                            <h2 style="margin-bottom: 20px;">Gestión de Clientes (CRM)</h2>
                            <div class="crm-table-container" style="max-height: 400px; overflow-y: auto;">
                                <table>
                                    <thead><tr><th>ID</th><th>Cliente</th><th>Correo</th><th>Registro</th><th>Estado</th></tr></thead>
                                    <tbody>${filasCRM || '<tr><td colspan="5">No hay clientes aún.</td></tr>'}</tbody>
                                </table>
                            </div>

                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                                <h2 style="margin: 0;">Gestión de Contenido (CMS)</h2>
                                <div style="display: flex; gap: 15px; align-items: center;">
                                    <input type="text" id="buscadorCMS" onkeyup="filtrarTabla()" placeholder="🔍 Buscar por título..." class="input-admin" style="margin-bottom: 0; width: 250px;">
                                    <button onclick="abrirModalCrear()" style="background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; white-space: nowrap;">➕ Agregar Película</button>
                                </div>
                            </div>
                            
                            <div class="crm-table-container" style="max-height: 500px; overflow-y: auto;">
                                <table>
                                    <thead><tr><th>ID</th><th>Título</th><th>Género</th><th>Visibilidad</th><th>Acciones</th></tr></thead>
                                    <tbody id="tablaPeliculas">${filasCMS || '<tr><td colspan="5">No hay películas aún.</td></tr>'}</tbody>
                                </table>
                            </div>
                        </div>

                        <!-- MODAL EDITAR -->
                        <div id="modalEditarPelicula" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 9999; justify-content: center; align-items: center;">
                            <div style="background: #111827; padding: 30px; border-radius: 12px; width: 90%; max-width: 600px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 50px rgba(0,0,0,0.5); max-height: 90vh; overflow-y: auto;">
                                <h2 style="margin-top: 0; border-bottom: 1px solid #1f2937; padding-bottom: 10px;">Editar Contenido</h2>
                                <input type="hidden" id="editId">
                                
                                <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px; cursor: pointer; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px;">
                                    <input type="checkbox" id="editActivo" style="width: 18px; height: 18px;"> 
                                    <span style="font-weight: bold; color: #10b981;">Película Visible en el Catálogo</span>
                                </label>

                                <label style="color: #94a3b8; font-size: 14px;">Título</label>
                                <input type="text" id="editTitulo" class="input-admin">
                                
                                <label style="color: #94a3b8; font-size: 14px;">URL del Video (.mp4 / Cloudinary)</label>
                                <input type="text" id="editVideoUrl" class="input-admin">
                                
                                <label style="color: #94a3b8; font-size: 14px;">URL de la Portada</label>
                                <input type="text" id="editImagenUrl" class="input-admin">

                                <label style="color: #94a3b8; font-size: 14px;">Géneros (separados por coma)</label>
                                <input type="text" id="editGenero" class="input-admin">
                                
                                <label style="color: #94a3b8; font-size: 14px;">Sinopsis</label>
                                <textarea id="editDescripcion" rows="4" class="input-admin" style="resize: vertical;"></textarea>
                                
                                <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 25px; cursor: pointer;">
                                    <input type="checkbox" id="editInfantil" style="width: 18px; height: 18px;"> 
                                    <span style="font-weight: bold; color: #fbbf24;">Apto para Perfiles Infantiles</span>
                                </label>

                                <div style="display: flex; justify-content: flex-end; gap: 15px;">
                                    <button onclick="cerrarModalEditar()" style="background: transparent; color: #cbd5e1; border: 1px solid #cbd5e1; padding: 10px 20px; border-radius: 6px; cursor: pointer;">Cancelar</button>
                                    <button onclick="guardarEdicionPelicula()" id="btnGuardarPeli" style="background: #e50914; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer;">Guardar Cambios</button>
                                </div>
                            </div>
                        </div>

                        <!-- MODAL CREAR (Se mantiene igual que antes, simplificado aquí para no alargar) -->
                        <div id="modalCrearPelicula" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 9999; justify-content: center; align-items: center;">
                            <div style="background: #111827; padding: 30px; border-radius: 12px; width: 90%; max-width: 500px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 50px rgba(0,0,0,0.5); max-height: 90vh; overflow-y: auto;">
                                <h2 style="margin-top: 0; border-bottom: 1px solid #1f2937; padding-bottom: 10px; color: #10b981;">Agregar Película</h2>
                                <label style="color: #94a3b8; font-size: 14px;">Título de la Película *</label>
                                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                                    <input type="text" id="crearTitulo" class="input-admin" placeholder="Ej: Spider-Man" style="margin-bottom: 0;">
                                    <button type="button" onclick="autocompletarConTMDb()" style="background: #3b82f6; color: white; border: none; padding: 0 15px; border-radius: 6px; cursor: pointer; font-weight: bold; white-space: nowrap;">🔍 Autocompletar</button>
                                </div>
                                <p id="msgTmdb" style="color: #3b82f6; font-size: 12px; margin-top: -10px; margin-bottom: 15px; display: none;">Buscando información...</p>
                                <label style="color: #94a3b8; font-size: 14px;">URL del Video *</label>
                                <input type="text" id="crearVideoUrl" class="input-admin">
                                <label style="color: #94a3b8; font-size: 14px;">Géneros</label>
                                <input type="text" id="crearGenero" class="input-admin">
                                <label style="color: #94a3b8; font-size: 14px;">URL de la Portada</label>
                                <input type="text" id="crearImagenUrl" class="input-admin">
                                <label style="color: #94a3b8; font-size: 14px;">Sinopsis</label>
                                <textarea id="crearDescripcion" rows="3" class="input-admin" style="resize: vertical;"></textarea>
                                <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 25px; cursor: pointer;">
                                    <input type="checkbox" id="crearInfantil" style="width: 18px; height: 18px;"> 
                                    <span style="font-weight: bold; color: #fbbf24;">Apto para Perfiles Infantiles</span>
                                </label>
                                <div style="display: flex; justify-content: flex-end; gap: 15px;">
                                    <button onclick="cerrarModalCrear()" style="background: transparent; color: #cbd5e1; border: 1px solid #cbd5e1; padding: 10px 20px; border-radius: 6px; cursor: pointer;">Cancelar</button>
                                    <button onclick="guardarNuevaPelicula()" id="btnCrearPeli" style="background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer;">Vincular y Guardar</button>
                                </div>
                            </div>
                        </div>

                        <script>
                            function cerrarSesionAdmin() {
                                localStorage.clear(); sessionStorage.clear(); window.location.href = "/login.html";
                            }
                            
                            // NUEVO BUSCADOR EN TIEMPO REAL
                            function filtrarTabla() {
                                const texto = document.getElementById("buscadorCMS").value.toLowerCase();
                                const filas = document.querySelectorAll(".fila-peli");
                                filas.forEach(fila => {
                                    const titulo = fila.querySelector(".titulo-peli").innerText.toLowerCase();
                                    fila.style.display = titulo.includes(texto) ? "" : "none";
                                });
                            }

                            async function eliminarPelicula(id) {
                                if(confirm("¿Estás seguro de eliminar esta película definitivamente del catálogo?")) {
                                    const res = await fetch(window.location.origin + "/api/admin/contenido/" + id, { method: "DELETE" });
                                    const data = await res.json();
                                    if(data.ok) window.location.reload();
                                    else alert("Error al eliminar.");
                                }
                            }

                            function abrirModalEditar(peli) {
                                document.getElementById('editId').value = peli.id;
                                document.getElementById('editTitulo').value = peli.titulo || '';
                                document.getElementById('editVideoUrl').value = peli.video_url || '';
                                document.getElementById('editImagenUrl').value = peli.imagen || '';
                                document.getElementById('editGenero').value = peli.genero || '';
                                document.getElementById('editDescripcion').value = peli.descripcion || '';
                                document.getElementById('editInfantil').checked = (Number(peli.infantil) === 1);
                                
                                // Manejo de la visibilidad (si es null o 1 es activo)
                                const estaActivo = (peli.activo === undefined || peli.activo === null || Number(peli.activo) === 1);
                                document.getElementById('editActivo').checked = estaActivo;

                                document.getElementById('modalEditarPelicula').style.display = 'flex';
                            }
                            
                            function cerrarModalEditar() { document.getElementById('modalEditarPelicula').style.display = 'none'; }

                            async function guardarEdicionPelicula() {
                                const btn = document.getElementById('btnGuardarPeli');
                                btn.innerText = "Guardando..."; btn.disabled = true;
                                const id = document.getElementById('editId').value;
                                const datos = {
                                    titulo: document.getElementById('editTitulo').value.trim(),
                                    video_url: document.getElementById('editVideoUrl').value.trim(),
                                    imagen: document.getElementById('editImagenUrl').value.trim(),
                                    genero: document.getElementById('editGenero').value.trim(),
                                    descripcion: document.getElementById('editDescripcion').value.trim(),
                                    infantil: document.getElementById('editInfantil').checked,
                                    activo: document.getElementById('editActivo').checked
                                };
                                try {
                                    const res = await fetch(window.location.origin + "/api/admin/contenido/" + id, {
                                        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos)
                                    });
                                    const resData = await res.json();
                                    if(resData.ok) window.location.reload();
                                    else { alert(resData.mensaje); btn.innerText = "Guardar Cambios"; btn.disabled = false; }
                                } catch(e) { alert("Error de conexión"); btn.innerText = "Guardar Cambios"; btn.disabled = false; }
                            }

                            // Funciones de Crear y Autocompletar (Se mantienen igual)
                            function abrirModalCrear() { document.getElementById('crearTitulo').value = ''; document.getElementById('crearVideoUrl').value = ''; document.getElementById('crearGenero').value = ''; document.getElementById('crearImagenUrl').value = ''; document.getElementById('crearDescripcion').value = ''; document.getElementById('crearInfantil').checked = false; document.getElementById('modalCrearPelicula').style.display = 'flex'; }
                            function cerrarModalCrear() { document.getElementById('modalCrearPelicula').style.display = 'none'; }

                            async function guardarNuevaPelicula() {
                                const video_url = document.getElementById('crearVideoUrl').value.trim();
                                const titulo = document.getElementById('crearTitulo').value.trim();
                                if (!video_url || !titulo) return alert("Título y URL requeridos.");
                                const btn = document.getElementById('btnCrearPeli'); btn.innerText = "Guardando..."; btn.disabled = true;
                                const datos = { video_url, titulo, genero: document.getElementById('crearGenero').value.trim(), imagen: document.getElementById('crearImagenUrl').value.trim(), descripcion: document.getElementById('crearDescripcion').value.trim(), infantil: document.getElementById('crearInfantil').checked };
                                try {
                                    const res = await fetch(window.location.origin + "/api/admin/contenido", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos) });
                                    const resData = await res.json();
                                    if(resData.ok) window.location.reload();
                                    else { alert(resData.mensaje); btn.innerText = "Vincular y Guardar"; btn.disabled = false; }
                                } catch(e) { alert("Error"); btn.innerText = "Vincular y Guardar"; btn.disabled = false; }
                            }

                            async function autocompletarConTMDb() {
                                const titulo = document.getElementById('crearTitulo').value.trim();
                                const msg = document.getElementById('msgTmdb');
                                if (!titulo) return alert("Escribe el título primero.");
                                msg.innerText = "Buscando..."; msg.style.display = "block";
                                try {
                                    const res = await fetch(window.location.origin + \`/tmdb/buscar-preview?titulo=\${encodeURIComponent(titulo)}\`);
                                    const data = await res.json();
                                    if (data.ok) {
                                        document.getElementById('crearTitulo').value = data.titulo; document.getElementById('crearDescripcion').value = data.descripcion; document.getElementById('crearImagenUrl').value = data.imagen;
                                        document.getElementById('crearInfantil').checked = data.genre_ids.includes(16) || data.genre_ids.includes(10751);
                                        msg.innerText = "¡Éxito! Revisa los datos."; msg.style.color = "#10b981";
                                    } else { msg.innerText = data.mensaje; msg.style.color = "#ef4444"; }
                                } catch(e) { msg.innerText = "Error."; msg.style.color = "#ef4444"; }
                            }
                        </script>
                    </body>
                    </html>
                    `;
                    res.send(html);
                });
            });
        });
    });
});
/* =========================================
   EDITAR PELÍCULA DESDE EL ADMIN (CMS)
========================================= */
app.put("/api/admin/contenido/:id", (req, res) => {
    const id = req.params.id;
    const { titulo, genero, descripcion, infantil, video_url, imagen, activo } = req.body;

    conexion.query(
        `UPDATE contenido SET titulo = ?, genero = ?, descripcion = ?, infantil = ?, video_url = ?, imagen = ?, activo = ? WHERE id = ?`,
        [titulo, genero, descripcion, infantil ? 1 : 0, video_url || "", imagen || "", activo ? 1 : 0, id],
        (err) => {
            if (err) {
                console.error(err);
                return res.json({ ok: false, mensaje: "Error al actualizar la base de datos." });
            }
            res.json({ ok: true, mensaje: "Película actualizada correctamente." });
        }
    );
});
/* =========================================
   MANEJADOR DE ERRORES 404 (SEGURO PARA VERCEL)
========================================= */
app.use((req, res) => {
    // En lugar de sendFile (que rompe Vercel), hacemos un redirect seguro
    res.status(404).redirect("/404.html");
});


module.exports = app;