var danmakuArray;

function getDanmaku() {
	//alert(cid);
	$.ajax(`https://comment.bilibili.com/${cid}.xml`, {
		type: "get",
		dataType: "text", //避免ajax解析为xml造成问题
		error: function(xhr, status, error) {
			showError("弹幕加载失败！");
		},
		success: function(data, status, xhr) {
			danmakuArray = new Array();
			$(data).find("d").each(function(i, o) {
				var info = $(o).attr("p").split(","),
					danmaku = {
					time: info[0],
					sendTime: info[4],
					user: info[6],
					text: $(o).html()
				}
				danmakuArray.push(danmaku);
			}); //解析xml文档
		}
	});
}

function danmakuFilter(T1, T2, ST1, ST2, user, text) {
	$("tbody").eq(2).html("");
	for (var i in danmakuArray) {
		var target = danmakuArray[i],
			time = parseFloat(target.time),
			sendTime = parseFloat(target.sendTime);
		if (T1 != null && time <= T1) continue; //time<=NaN为false
		if (T2 != null && time >= T2) continue;
		if (ST1 != null && sendTime <= ST1) continue;
		if (ST2 != null && sendTime >= ST2) continue;
		if (user != null && user != "" && target.user != user) continue;
		if (text != null && target.text.indexOf(text) == -1) continue;
		var newDate = new Date();
		newDate.setTime(sendTime * 1000);
		sendTime = newDate.toISOString().substring(5, 19).replace("T", " ");
		$("tbody").eq(2).append(`<tr>
			<td>${formatSeconds(time)}</td>
			<td>${sendTime}</td>
			<td class="wrap">${target.text}</td>
			<td>
				<a href="#" onclick="searchUser(event)">${target.user}</button>
			</td>
		</tr>`);
	}
}

function formatSeconds(value) {
	function addZero(int) {
		string = int.toString();
		while (string.length < 2) string = "0" + string;
		return string;
	}
	var ms = value - parseInt(value),
		secondTime = parseInt(value) || 0,
		minuteTime = 0;
	if (secondTime > 60) {
		minuteTime = parseInt(secondTime / 60);
		secondTime = parseInt(secondTime % 60);
	}
	return `${addZero(minuteTime)}:${addZero(secondTime)}.${ms.toFixed(3).split(".")[1]}`;
}

function searchUser(event) {
	event.preventDefault();
	var user = $(event.target).html(),
		uid;
	if (0 === user.indexOf("D")) uid = "";
	else if (/^b(\d+)$/.exec(user)) uid = /^b(\d+)$/.exec(user)[1];
	else {
		var crcEngine = new Crc32Engine();
		uid = crcEngine.crack(user)[0]; //计算量较大！手动点击开始查询用户
	}
	var url = "https://space.bilibili.com/" + uid;
	//alert(url);
	shell.openExternal(url);
}

function xml() {
	blobDownload(`https://comment.bilibili.com/${cid}.xml`, cid + ".xml");
}

function ass() {
	//使用ajax是因为bilibili采用了content-encoding:deflate压缩，若使用https.get需要zlib库解压，较为复杂
	$.ajax(`https://comment.bilibili.com/${cid}.xml`, {
		type: "get",
		dataType: "text",
		error: function(xhr, status, error) {
			showError("弹幕下载失败！");
		},
		success: function(data, status, xhr) {
			var danmaku = parseFile(data),
				ass = generateASS(setPosition(danmaku), {
				"title": document.title,
				"ori": cid,
			});
			assDownload(ass, cid + ".ass"); //"\ufeff" + 
		}
	});
}

function parseFile(content) {
	content = content.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
	return parseXML(content);
}

function assDownload(data, filename) {
	var blob = new Blob([data], {
		type: "application/octet-stream"
	}),
		url = window.URL.createObjectURL(blob);
	blobDownload(url, filename);
	document.addEventListener("unload", function() {
		window.URL.revokeObjectURL(url);
	});
}

function blobDownload(url, filename) {
	var saveas = document.createElement("a");
	saveas.href = url;
	saveas.style.display = "none";
	document.body.appendChild(saveas);
	saveas.download = filename;
	saveas.click();
	setTimeout(function() {
		saveas.parentNode.removeChild(saveas);
	}, 1000);
}
