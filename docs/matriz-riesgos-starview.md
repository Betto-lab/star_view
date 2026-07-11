# Matriz de Riesgos de Seguridad - StarView

## 1. Descripción

La matriz de riesgos de seguridad permite identificar amenazas que pueden afectar al sistema StarView, sus activos principales, vulnerabilidades, impacto y controles de mitigación.

StarView administra usuarios, perfiles, contraseñas, suscripciones, pagos, catálogo de películas y restricciones por perfil infantil. Por ello, es importante evaluar riesgos relacionados con confidencialidad, integridad y disponibilidad de la información.

---

## 2. Criterios de evaluación

Para el análisis cualitativo se utiliza la siguiente escala:

| Nivel | Valor |
|---|---:|
| Alto | 3 |
| Medio | 2 |
| Bajo | 1 |

El resultado del riesgo se calcula considerando:

| Criterio | Porcentaje |
|---|---:|
| Financiero | 60% |
| Operativo | 30% |
| Imagen | 10% |

Fórmula utilizada:

```text
Resultado = Financiero(0.60) + Operativo(0.30) + Imagen(0.10)
```

---

## 3. Matriz de riesgos adaptada al proyecto StarView

| N° | Descripción de la amenaza | Activos relacionados | Vulnerabilidad de los activos | Descripción del riesgo | Impacto | Integridad | Disponibilidad | Confidencialidad | Financiero | Operativo | Imagen | Resultado | Evitar | Asumir | Mitigar | Transferir |
|---:|---|---|---|---|---|:---:|:---:|:---:|---:|---:|---:|---:|:---:|:---:|---|:---:|
| 1 | Ataque de denegación de servicio | Servidor backend, frontend y base de datos | Falta de límite de solicitudes o protección contra tráfico excesivo | Caída temporal del sistema y usuarios sin acceso a StarView | Pérdida de disponibilidad del servicio |  | X |  | 2 | 3 | 1 | 2.2 |  |  | Implementar rate limiting, monitoreo y limpieza de sesiones activas |  |
| 2 | Accesos no autorizados | Cuentas de usuario, perfiles y sesiones | Contraseñas débiles, mala gestión de sesión o token expuesto | Ingreso no autorizado a cuentas de usuarios | Robo o modificación de información de usuario | X |  | X | 2 | 2 | 3 | 2.1 |  |  | Usar bcrypt, JWT, cierre de sesión seguro y validaciones de acceso |  |
| 3 | Manipulación de pagos o suscripciones | Módulo de pagos, Mercado Pago y tabla de suscripciones | Activación de suscripción sin confirmación real del pago | Un usuario podría obtener acceso sin pagar correctamente | Pérdida económica y afectación del modelo de negocio | X |  |  | 3 | 2 | 2 | 2.6 |  |  | Implementar webhook de Mercado Pago y validar pagos desde el backend |  |
| 4 | Exposición de datos sensibles | Base de datos, usuarios y variables de entorno | Mala configuración de variables o publicación accidental de credenciales | Filtración de correos, contraseñas cifradas o claves privadas | Pérdida de confianza y posible acceso indebido |  |  | X | 3 | 2 | 3 | 2.7 |  |  | Usar variables de entorno, no subir .env y restringir accesos a Railway/GitHub |  |
| 5 | Acceso infantil a contenido no apto | Perfiles infantiles y catálogo de contenido | Filtro infantil incompleto en frontend o backend | Un perfil infantil podría ver contenido no permitido | Afectación de la experiencia y confianza del usuario | X |  |  | 1 | 2 | 3 | 1.5 |  |  | Validar contenido infantil desde backend y no solo desde frontend |  |
| 6 | Modificación no autorizada del catálogo | Panel administrador y tabla contenido | Falta de control de rol administrador | Usuarios no autorizados podrían agregar, editar o eliminar películas | Alteración del catálogo del sistema | X |  |  | 2 | 3 | 2 | 2.3 |  |  | Verificar rol administrador antes de permitir acciones críticas |  |
| 7 | Pérdida de información | Base de datos de usuarios, pagos, perfiles e historial | Falta de respaldos periódicos | Pérdida de registros importantes del sistema | Interrupción del servicio y pérdida de trazabilidad | X | X |  | 3 | 3 | 2 | 2.9 |  |  | Programar respaldos de base de datos y exportaciones periódicas |  |
| 8 | Inyección o manipulación de datos | Formularios de login, registro, cuenta y perfiles | Entradas no validadas correctamente | Inserción o modificación indebida de información | Alteración de datos o errores del sistema | X |  | X | 2 | 2 | 2 | 2.0 |  |  | Validar campos, usar consultas parametrizadas y controlar errores |  |

---

## 4. Interpretación de resultados

Los riesgos con mayor prioridad dentro del sistema StarView son los siguientes:

| Prioridad | Riesgo | Resultado |
|---:|---|---:|
| 1 | Pérdida de información | 2.9 |
| 2 | Exposición de datos sensibles | 2.7 |
| 3 | Manipulación de pagos o suscripciones | 2.6 |
| 4 | Modificación no autorizada del catálogo | 2.3 |
| 5 | Ataque de denegación de servicio | 2.2 |

Estos riesgos deben atenderse primero porque afectan directamente la continuidad del servicio, la seguridad de los datos, la confianza del usuario y el funcionamiento económico del sistema.

---

## 5. Controles aplicados en StarView

El proyecto StarView ya cuenta con algunos controles de seguridad implementados:

- Uso de `bcrypt` para proteger contraseñas.
- Uso de `JWT` para manejo de sesión.
- Endpoint `/api/logout` para cierre de sesión.
- Validación de contraseña segura.
- Validación de correo electrónico.
- Separación de perfiles normales e infantiles.
- Validación de contenido infantil desde el backend.
- Control de administrador para gestionar el catálogo.
- Integración con Mercado Pago para procesar pagos.
- Uso de variables de entorno para credenciales sensibles.

---

## 6. Controles recomendados

Para mejorar la seguridad del sistema, se recomienda implementar los siguientes controles:

- Agregar webhook de Mercado Pago para confirmar pagos automáticamente.
- Implementar rate limiting para evitar ataques de solicitudes masivas.
- Programar respaldos periódicos de la base de datos.
- Agregar monitoreo de errores del backend.
- Revisar periódicamente permisos de administrador.
- Evitar subir archivos `.env` o credenciales al repositorio.
- Validar todos los formularios tanto en frontend como en backend.
- Revisar logs de acceso y actividad sospechosa.

---

## 7. Conclusión

La matriz de riesgos de seguridad permite visualizar las principales amenazas que podrían afectar al sistema StarView. Al tratarse de una plataforma que gestiona usuarios, contraseñas, perfiles, pagos, suscripciones y contenido, resulta necesario aplicar controles de seguridad para proteger la información y garantizar la continuidad del servicio.

Los riesgos más relevantes están relacionados con pérdida de información, exposición de datos sensibles, manipulación de pagos y modificación no autorizada del catálogo. Por ello, la mitigación debe enfocarse en reforzar la seguridad del backend, proteger la base de datos, validar pagos correctamente y mantener controles de acceso adecuados.