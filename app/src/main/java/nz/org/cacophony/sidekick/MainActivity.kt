package nz.org.cacophony.sidekick

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.net.nsd.NsdManager
import android.os.Bundle
import android.provider.Browser
import android.support.v7.app.AppCompatActivity
import android.support.v7.widget.LinearLayoutManager
import android.support.v7.widget.RecyclerView
import android.util.Log
import android.view.Menu
import android.view.MenuItem
import java.net.URL

const val TAG = "cacophony-manager"

class MainActivity : AppCompatActivity() {
    private lateinit var recyclerView: RecyclerView
    private lateinit var deviceListAdapter: DeviceListAdapter
    private lateinit var discovery: DiscoveryManager
    private lateinit var devices: DeviceList

    override fun onCreate(savedInstanceState: Bundle?) {
        Log.d(TAG, "onCreate")
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        devices = DeviceList()
        deviceListAdapter = DeviceListAdapter(devices) { h -> onDeviceClick(h) }
        devices.setOnChanged { notifyDeviceListChanged() }

        val recyclerLayoutManager = LinearLayoutManager(this)
        recyclerView = findViewById<RecyclerView>(R.id.device_list).apply {
            setHasFixedSize(true)
            layoutManager = recyclerLayoutManager
            adapter = deviceListAdapter
        }

        val nsdManager = getSystemService(Context.NSD_SERVICE) as NsdManager
        discovery = DiscoveryManager(nsdManager, devices)
    }

    private fun onDeviceClick(d: Device) {
        val uri = Uri.parse(URL("http", d.hostname, d.port, "/").toString())
        Log.d(TAG, "opening browser to: ${uri}")

        val urlIntent = Intent(Intent.ACTION_VIEW, uri)
        urlIntent.putExtra(Browser.EXTRA_APPLICATION_ID, "${TAG}-${d.name}")  // Single browse tab per device.
        startActivity(urlIntent)
    }

    override fun onCreateOptionsMenu(menu: Menu?): Boolean {
        // Put refresh button into action bar
        getMenuInflater().inflate(R.menu.refresh, menu);
        return super.onCreateOptionsMenu(menu)
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        val id = item.getItemId();
        if (id == R.id.refresh_button) {
            Log.d(TAG, "refresh")
            discovery.restart(clear = true)
        }
        return super.onOptionsItemSelected(item)
    }

    private fun notifyDeviceListChanged() {
        // notifyDataSetChanged has to be called on the UI thread.
        // notifyDataSetChanged is the most inefficient way of updating the RecyclerView but
        // given the small number of items and low update rate, it's probably fine for now.
        runOnUiThread { deviceListAdapter.notifyDataSetChanged() }
    }

    override fun onResume() {
        Log.d(TAG, "onResume")
        super.onResume()
        discovery.restart()
    }

    override fun onPause() {
        Log.d(TAG, "onPause")
        super.onPause()
        discovery.stop()
    }
}

