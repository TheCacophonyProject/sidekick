/*
 * sidekick - Network discovery for Cacophony Project devices
 * Copyright (C) 2018, The Cacophony Project
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

package nz.org.cacophony.sidekick

import android.content.Context
import android.content.Intent
import android.graphics.PorterDuff
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
import android.widget.ProgressBar
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

        setProgressBarColor()

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

    private fun setProgressBarColor() {
        val progressBar = findViewById<ProgressBar>(R.id.progressBar)
        progressBar.indeterminateDrawable.setColorFilter(
                resources.getColor(R.color.colorPrimary),
                PorterDuff.Mode.SRC_ATOP
        )
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

