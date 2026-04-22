* icons
* mention how to use ipv6_suffix with a linux device like HAOS behind a Fritz!Box (upstream?)
  ```shell
  ha network update end0 --ipv6-method auto --ipv6-privacy disabled --ipv6-addr-gen-mode eui64
  # change the suffix in the router to the current one.
  ```
  ````shell
  nmcli connection modify "Loading..." ipv6.ip6-privacy 0 # disable temporary addresses
  nmcli connection modify "Loading..." ipv6.addr-gen-mode eui64 # use the EUI-64 method to generate the IPv6 address, which will include the device's MAC address and ensure a consistent suffix.
  # change the suffix in the router to the current one.
  ````
  * Windows?
* mention rebind protection and how to disable it for the local network in the router (upstream?)
* screenshots
* themeing (upstream needed)
* fix healthcheck upstream to not die if DNS is not working.
* mention how to access database and backup files via file editor.
* buy quentin a coffee
