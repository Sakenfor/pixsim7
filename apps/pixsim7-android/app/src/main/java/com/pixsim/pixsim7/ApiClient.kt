package com.pixsim.pixsim7

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class PairingResponse(val pairingCode: String, val agentId: String)

class ApiClient(private val baseUrl: String) {

    suspend fun requestPairing(
        agentId: String,
        name: String,
        host: String
    ): PairingResponse = withContext(Dispatchers.IO) {

        val json = JSONObject().apply {
            put("agent_id", agentId)
            put("name", name)
            put("host", host)
            put("port", 5037)
            put("api_port", 8765)
            put("version", "1.0.0")
            put("os_info", "Android ${android.os.Build.VERSION.RELEASE}")
        }

        val response = post("/automation/agents/request-pairing", json)

        PairingResponse(
            pairingCode = response.getString("pairing_code"),
            agentId = response.getString("agent_id")
        )
    }

    suspend fun checkPairingStatus(agentId: String): String = withContext(Dispatchers.IO) {
        val response = get("/automation/agents/pairing-status/$agentId")
        response.getString("status")
    }

    suspend fun sendHeartbeat(
        agentId: String,
        devices: List<Map<String, String>>
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val json = JSONObject().apply {
                val devicesArray = JSONArray()
                devices.forEach { device ->
                    devicesArray.put(JSONObject(device))
                }
                put("devices", devicesArray)
                put("timestamp", System.currentTimeMillis().toString())
            }

            post("/automation/agents/$agentId/heartbeat", json)
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun post(endpoint: String, body: JSONObject): JSONObject {
        val url = URL("$baseUrl$endpoint")
        val conn = url.openConnection() as HttpURLConnection

        conn.apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            doOutput = true
            connectTimeout = 10000
            readTimeout = 10000

            outputStream.use { it.write(body.toString().toByteArray()) }

            val responseCode = responseCode
            if (responseCode !in 200..299) {
                val error = try {
                    errorStream?.bufferedReader()?.readText() ?: "Unknown error"
                } catch (e: Exception) {
                    "HTTP $responseCode"
                }
                throw Exception("API Error: $error")
            }

            return JSONObject(inputStream.bufferedReader().readText())
        }
    }

    private fun get(endpoint: String): JSONObject {
        val url = URL("$baseUrl$endpoint")
        val conn = url.openConnection() as HttpURLConnection

        conn.apply {
            requestMethod = "GET"
            connectTimeout = 10000
            readTimeout = 10000

            val responseCode = responseCode
            if (responseCode !in 200..299) {
                throw Exception("HTTP $responseCode")
            }

            return JSONObject(inputStream.bufferedReader().readText())
        }
    }
}
