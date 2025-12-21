package com.pixsim.pixsim7

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.*
import java.util.concurrent.TimeUnit

class HeartbeatService : Service() {

    private lateinit var agentId: String
    private lateinit var apiClient: ApiClient
    private lateinit var deviceScanner: DeviceScanner
    private val serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    override fun onCreate() {
        super.onCreate()
        // ZeroTier backend URL
        apiClient = ApiClient("http://10.243.48.125:8001")
        deviceScanner = DeviceScanner()

        Log.d(TAG, "HeartbeatService created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        agentId = intent?.getStringExtra(EXTRA_AGENT_ID) ?: return START_NOT_STICKY

        Log.d(TAG, "Starting heartbeat for agent: $agentId")

        // Start heartbeat loop
        serviceScope.launch {
            while (isActive) {
                try {
                    val devices = deviceScanner.scanDevices()
                    val success = apiClient.sendHeartbeat(agentId, devices)

                    if (success) {
                        Log.d(TAG, "Heartbeat sent successfully (${devices.size} devices)")
                    } else {
                        Log.w(TAG, "Heartbeat failed")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Heartbeat error: ${e.message}", e)
                }

                delay(TimeUnit.SECONDS.toMillis(30)) // Every 30 seconds
            }
        }

        return START_STICKY // Restart if killed by system
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
        Log.d(TAG, "HeartbeatService destroyed")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val TAG = "HeartbeatService"
        private const val EXTRA_AGENT_ID = "agent_id"

        fun start(context: Context, agentId: String) {
            val intent = Intent(context, HeartbeatService::class.java).apply {
                putExtra(EXTRA_AGENT_ID, agentId)
            }
            context.startService(intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, HeartbeatService::class.java)
            context.stopService(intent)
        }
    }
}
