const fs = require('fs');
const path = require('path');
const os = require('os');

// Obtener el timeout por defecto (10,000 ms) o sobrescrito por variable de entorno
function getLockTimeout() {
  const envTimeout = process.env.GSD_CANVA_LOCK_TIMEOUT_MS;
  if (envTimeout) {
    const parsed = parseInt(envTimeout, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 10000; // 10 segundos
}

/**
 * Intenta adquirir un bloqueo atómico sobre el archivo indicado de forma síncrona
 */
function acquireSync(lockFilePath) {
  const lockData = {
    pid: process.pid,
    hostname: os.hostname(),
    cwd: process.cwd(),
    createdAt: new Date().toISOString()
  };
  
  const content = JSON.stringify(lockData, null, 2);
  
  try {
    // La bandera 'wx' abre en modo exclusivo: falla si el archivo ya existe
    fs.writeFileSync(lockFilePath, content, { flag: 'wx', encoding: 'utf8' });
    return true; // Bloqueo adquirido
  } catch (err) {
    if (err.code === 'EEXIST') {
      // El bloqueo ya existe, comprobar si es huérfano (stale)
      if (isLockStale(lockFilePath)) {
        try {
          // Es huérfano: eliminar y reintentar
          fs.unlinkSync(lockFilePath);
          fs.writeFileSync(lockFilePath, content, { flag: 'wx', encoding: 'utf8' });
          return true;
        } catch (retryErr) {
          // Reintento falló si otro proceso lo ganó en esa milésima de segundo
          return false;
        }
      }
      return false;
    }
    throw err;
  }
}

/**
 * Determina si el lockfile actual es huérfano o ha expirado
 */
function isLockStale(lockFilePath) {
  try {
    if (!fs.existsSync(lockFilePath)) return true;
    
    const content = fs.readFileSync(lockFilePath, 'utf8');
    const lockData = JSON.parse(content);
    
    // 1. Verificación por Timeout absoluto
    const age = Date.now() - new Date(lockData.createdAt).getTime();
    if (age > getLockTimeout()) {
      return true; // Expirado
    }
    
    // 2. Verificación de PID vivo si es en la misma máquina y CWD
    if (lockData.hostname === os.hostname() && lockData.cwd === process.cwd()) {
      try {
        // Enviar señal 0 para verificar si el PID existe en macOS/Unix
        process.kill(lockData.pid, 0);
        return false; // El PID sigue activo, el lock está ocupado
      } catch (e) {
        return true; // El proceso dueño del lock ya no existe
      }
    }
    
    return false;
  } catch (e) {
    // Si está corrupto o ilegible, lo tratamos como huérfano para poder recuperarlo
    return true;
  }
}

/**
 * Espera y reintenta adquirir el bloqueo hasta que expire el tiempo de espera
 */
async function acquire(lockFilePath, waitTimeoutMs = getLockTimeout()) {
  const start = Date.now();
  
  while (Date.now() - start < waitTimeoutMs) {
    const success = acquireSync(lockFilePath);
    if (success) {
      return true;
    }
    // Esperar 100 milisegundos antes del reintento
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  const error = new Error(`Tiempo de espera agotado al intentar adquirir el bloqueo de concurrencia (${waitTimeoutMs} ms).`);
  error.code = 'GSDC_LOCK_TIMEOUT';
  error.exitCode = 10;
  throw error;
}

/**
 * Libera de forma segura el bloqueo si le pertenece al proceso actual
 */
function release(lockFilePath) {
  try {
    if (fs.existsSync(lockFilePath)) {
      const content = fs.readFileSync(lockFilePath, 'utf8');
      const lockData = JSON.parse(content);
      
      // Liberar únicamente si este proceso lo creó
      if (lockData.pid === process.pid) {
        fs.unlinkSync(lockFilePath);
        return true;
      }
    }
  } catch (e) {
    // Ignorar fallos de liberación silenciosa
  }
  return false;
}

module.exports = {
  acquire,
  release
};
