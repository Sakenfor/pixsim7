package com.pixsim.pixsim7

import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.*
import java.util.UUID

class MainActivity : AppCompatActivity() {
    private val agentId = UUID.randomUUID().toString()
    private lateinit var apiClient: ApiClient
    private var pollingJob: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // ZeroTier backend URL
        apiClient = ApiClient("http://10.243.48.125:8001")

        val pairingCodeText = findViewById<TextView>(R.id.pairingCode)
        val statusText = findViewById<TextView>(R.id.status)
        val startButton = findViewById<Button>(R.id.startPairing)

        startButton.setOnClickListener {
            startButton.isEnabled = false

            CoroutineScope(Dispatchers.Main).launch {
                try {
                    statusText.text = "Requesting pairing code..."

                    // Request pairing code from backend
                    val response = apiClient.requestPairing(
                        agentId = agentId,
                        name = android.os.Build.MODEL,
                        host = "auto"
                    )

                    pairingCodeText.text = response.pairingCode
                    statusText.text = "Enter this code on pixsim.com"

                    // Start polling for pairing completion
                    pollPairingStatus(statusText)

                } catch (e: Exception) {
                    statusText.text = "Error: ${e.message}"
                    startButton.isEnabled = true
                }
            }
        }
    }

    private fun pollPairingStatus(statusText: TextView) {
        pollingJob = CoroutineScope(Dispatchers.Main).launch {
            while (isActive) {
                delay(3000) // Poll every 3 seconds

                try {
                    val status = apiClient.checkPairingStatus(agentId)

                    when (status) {
                        "paired" -> {
                            statusText.text = "✓ Connected successfully!\nRunning in background..."

                            // Start background heartbeat service
                            HeartbeatService.start(this@MainActivity, agentId)

                            // Stop polling
                            cancel()
                        }
                        "expired" -> {
                            statusText.text = "Code expired. Please try again."
                            findViewById<Button>(R.id.startPairing).isEnabled = true
                            cancel()
                        }
                        "pending" -> {
                            // Continue polling
                        }
                        "unknown" -> {
                            statusText.text = "Unknown status. Please try again."
                            findViewById<Button>(R.id.startPairing).isEnabled = true
                            cancel()
                        }
                    }
                } catch (e: Exception) {
                    // Continue polling on error (might be network hiccup)
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        pollingJob?.cancel()
    }
}
