package com.pixsim.pixsim7

import se.vidstige.jadb.JadbConnection
import se.vidstige.jadb.JadbException

class DeviceScanner {

    fun scanDevices(): List<Map<String, String>> {
        return try {
            val jadb = JadbConnection()
            val devices = jadb.devices

            devices.map { device ->
                mapOf(
                    "serial" to device.serial,
                    "state" to device.state.toString().lowercase()
                )
            }
        } catch (e: JadbException) {
            // ADB daemon not running or no devices connected
            emptyList()
        } catch (e: Exception) {
            // Other errors (network, etc.)
            emptyList()
        }
    }
}
